-- 管理画面を「ホーム画面に追加」したアプリへのプッシュ通知（WEB予約・SMSの返信・SMS残高）。
-- 既存のLINE通知はそのまま残し、並行して送る（試験運用）。セラピストへの通知はLINEのまま。
--
-- 送信用の鍵（VAPID）は Vault に手で入れる（リポジトリには入れない）:
--   web_push_vapid_public_key   … base64url（ブラウザ側の applicationServerKey と同じ）
--   web_push_vapid_private_jwk  … ECDSA P-256 秘密鍵の JWK（JSON文字列）

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  topics text[] not null default array['web_booking', 'sms_reply', 'sms_balance'],
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  failure_count integer not null default 0
);
create index push_subscriptions_store_idx on public.push_subscriptions (store_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, update, delete on public.push_subscriptions to authenticated;

-- 自分の端末だけ見られる・変えられる（登録は下の save_push_subscription で行う）
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid() and store_id in (select public.current_store_ids()))
  with check (user_id = auth.uid() and store_id in (select public.current_store_ids()));

-- 端末の登録。同じ端末（endpoint）を別の人が登録し直したら、その人の端末に付け替える
create or replace function public.save_push_subscription(
  p_store_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_topics text[] default array['web_booking', 'sms_reply', 'sms_balance'],
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_store_id not in (select public.current_store_ids()) then
    raise exception 'この店舗の通知は登録できません' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception '通知の登録情報が正しくありません' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (user_id, store_id, endpoint, p256dh, auth, topics, device_label)
  values (auth.uid(), p_store_id, p_endpoint, p_p256dh, p_auth,
          coalesce(p_topics, array['web_booking', 'sms_reply', 'sms_balance']), left(p_device_label, 100))
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    store_id = excluded.store_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    topics = excluded.topics,
    device_label = excluded.device_label,
    updated_at = now(),
    failure_count = 0,
    last_error = null
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.save_push_subscription(uuid, text, text, text, text[], text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text[], text) to authenticated;

-- 送信用の鍵（Edge Function から service_role で読む）
create or replace function public.get_web_push_vapid()
returns table (public_key text, private_jwk text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'web_push_vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'web_push_vapid_private_jwk')
$$;
revoke all on function public.get_web_push_vapid() from public, anon, authenticated;
grant execute on function public.get_web_push_vapid() to service_role;

-- トリガーから push-notify を呼ぶときの合言葉
create or replace function public.verify_push_notify_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate is not null
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'push_notify_internal_secret' and decrypted_secret = candidate
    );
$$;
revoke all on function public.verify_push_notify_secret(text) from public, anon, authenticated;
grant execute on function public.verify_push_notify_secret(text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_notify_internal_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_notify_internal_secret',
      'Authenticates database trigger calls to push-notify'
    );
  end if;
end;
$$;

-- WEB予約・SMSの返信・SMS残高の知らせが入ったら push-notify を呼ぶ（受け取る端末があるときだけ）。
-- 通知の失敗で予約やSMSの記録が止まらないよう、例外は握りつぶす
create or replace function public.trg_push_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_event text;
  v_store uuid;
begin
  if tg_table_name = 'reservations' then
    if new.booking_origin not in ('web_form', 'cast_form') then return new; end if;
    v_event := 'web_booking';
    v_store := new.store_id;
  elsif tg_table_name = 'sms_logs' then
    if new.direction is distinct from 'inbound' then return new; end if;
    v_event := 'sms_reply';
    v_store := new.store_id;
  elsif tg_table_name = 'sms_balance_alerts' then
    v_event := 'sms_balance';
  else
    return new;
  end if;

  if not exists (
    select 1 from public.push_subscriptions s
    where v_event = any (s.topics) and (v_store is null or s.store_id = v_store)
  ) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-push-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_internal_secret')
    ),
    body := jsonb_build_object('event', v_event, 'id', new.id)
  );
  return new;
exception when others then
  raise warning 'push notify skipped: %', sqlerrm;
  return new;
end;
$function$;

create trigger reservations_push_notify after insert on public.reservations
  for each row execute function public.trg_push_notify();
create trigger sms_logs_push_notify after insert on public.sms_logs
  for each row execute function public.trg_push_notify();
create trigger sms_balance_alerts_push_notify after insert on public.sms_balance_alerts
  for each row execute function public.trg_push_notify();
