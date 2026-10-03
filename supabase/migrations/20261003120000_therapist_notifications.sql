-- セラピストへの予約通知を1か所にまとめる。
--
-- 予約の 確定・変更・キャンセル（reservations のトリガー）
--   → therapist_notifications（通知待ち。同じ予約の続けての変更は1件にまとめる）
--   → pg_cron（30秒ごと）→ private.dispatch_therapist_notifications()
--   → Edge Function notify-therapist（x-therapist-notify-secret）
--   → セラピストのマイページ（ホーム画面に追加したもの）へプッシュ通知
--      ・端末が無い人だけ、移行中は本人のLINEグループへ（共通グループには送らない）
--      ・どちらも無い／送れない → 管理画面とスマホ通知（topic therapist_notify）で知らせる
-- お客様へのSMSは今まで通り trg_send_reservation_sms（Twilio）が送る。

-- ── セラピストの端末（マイページをホーム画面に追加して通知を許可したもの） ─────────
create table public.therapist_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  failure_count integer not null default 0
);
create index therapist_push_subscriptions_cast_idx on public.therapist_push_subscriptions (cast_id);
create index therapist_push_subscriptions_store_idx on public.therapist_push_subscriptions (store_id);

alter table public.therapist_push_subscriptions enable row level security;
revoke all on public.therapist_push_subscriptions from anon, authenticated;
grant select, delete on public.therapist_push_subscriptions to authenticated;
grant all on public.therapist_push_subscriptions to service_role;

create policy therapist_push_subscriptions_managers on public.therapist_push_subscriptions
  for select to authenticated
  using ((select public.can_manage_store(store_id)));
create policy therapist_push_subscriptions_managers_delete on public.therapist_push_subscriptions
  for delete to authenticated
  using ((select public.can_manage_store(store_id)));

-- ── 通知待ち・送った記録 ───────────────────────────────────────
create table public.therapist_notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  kind text not null check (kind in ('new', 'changed', 'cancelled')),
  -- changed: 変わった項目の変更前の値 / cancelled: キャンセル時点の予約内容（担当変更のときは reason）
  changes jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  status text not null default 'queued' check (status in (
    'queued',       -- 送る前
    'sending',      -- 送っている
    'sent',         -- 届けた（channel = push / line）
    'unreachable',  -- 端末もLINEグループも無く送れなかった
    'failed',       -- 何度か試したが送れなかった
    'skipped'       -- 送る前に取り消された・担当が変わったなどで送る必要がなくなった
  )),
  channel text check (channel is null or channel in ('push', 'line')),
  attempts smallint not null default 0,
  available_at timestamptz not null default now() + interval '20 seconds',
  sent_at timestamptz,
  error_message text,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index therapist_notifications_due_idx on public.therapist_notifications (available_at)
  where status in ('queued', 'sending');
create index therapist_notifications_reservation_idx on public.therapist_notifications (reservation_id, created_at desc);
create index therapist_notifications_problem_idx on public.therapist_notifications (store_id, created_at desc)
  where status in ('unreachable', 'failed') and acknowledged_at is null;
create index therapist_notifications_cast_idx on public.therapist_notifications (cast_id);

alter table public.therapist_notifications enable row level security;
revoke all on public.therapist_notifications from anon, authenticated;
grant select on public.therapist_notifications to authenticated;
grant all on public.therapist_notifications to service_role;

create policy therapist_notifications_managers_read on public.therapist_notifications
  for select to authenticated
  using ((select public.can_manage_store(store_id)));

-- ── 通知待ちに積む（同じ予約・同じセラピストのまだ送っていない通知はまとめる） ─────
create or replace function private.enqueue_therapist_notification(
  p_store_id uuid,
  p_cast_id uuid,
  p_reservation_id uuid,
  p_kind text,
  p_changes jsonb default '{}'::jsonb,
  p_snapshot jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.therapist_notifications;
begin
  select * into v_pending
  from public.therapist_notifications
  where reservation_id = p_reservation_id
    and cast_id = p_cast_id
    and status = 'queued'
    and source = 'auto'
  order by created_at desc
  limit 1
  for update;

  if v_pending.id is not null then
    if p_kind = 'cancelled' then
      if v_pending.kind = 'new' then
        -- まだ知らせていない予約が取り消された：何も送らなくてよい
        update public.therapist_notifications
        set status = 'skipped', error_message = '送る前にキャンセル・担当変更されたため送っていません', updated_at = now()
        where id = v_pending.id;
        return;
      end if;
      update public.therapist_notifications
      set kind = 'cancelled', snapshot = p_snapshot, changes = '{}'::jsonb,
          available_at = now() + interval '20 seconds', updated_at = now()
      where id = v_pending.id;
      return;
    elsif p_kind = 'changed' then
      -- new のままなら最新の内容で送るだけ。changed 同士は最初の変更前の値を残す
      update public.therapist_notifications
      set changes = case when kind = 'changed' then p_changes || changes else changes end,
          available_at = now() + interval '20 seconds', updated_at = now()
      where id = v_pending.id;
      return;
    elsif p_kind = 'new' and v_pending.kind = 'cancelled' then
      update public.therapist_notifications
      set status = 'skipped', error_message = '取り消しの後すぐに予約が戻ったため送っていません', updated_at = now()
      where id = v_pending.id;
    elsif p_kind = 'new' then
      update public.therapist_notifications
      set available_at = now() + interval '20 seconds', updated_at = now()
      where id = v_pending.id;
      return;
    end if;
  end if;

  insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, changes, snapshot)
  values (p_store_id, p_cast_id, p_reservation_id, p_kind, coalesce(p_changes, '{}'::jsonb), coalesce(p_snapshot, '{}'::jsonb));
end;
$$;
revoke all on function private.enqueue_therapist_notification(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- 予約の 確定・変更・キャンセル を拾う。通知の失敗で予約の保存が止まらないよう、例外は握りつぶす
create or replace function public.trg_enqueue_therapist_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 営業日は朝6時切り替え。過去の予約の手直しでは知らせない
  v_today date := (timezone('Asia/Tokyo', now()) - interval '6 hours')::date;
  v_changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' and new.cast_id is not null and new.reservation_date >= v_today then
      perform private.enqueue_therapist_notification(new.store_id, new.cast_id, new.id, 'new');
    end if;
    return new;
  end if;

  if greatest(new.reservation_date, old.reservation_date) < v_today then
    return new;
  end if;

  -- キャンセル
  if old.status = 'confirmed' and new.status = 'cancelled' then
    if old.cast_id is not null then
      perform private.enqueue_therapist_notification(old.store_id, old.cast_id, old.id, 'cancelled', '{}'::jsonb,
        jsonb_build_object('reservation_date', old.reservation_date, 'start_time', old.start_time,
          'duration', old.duration, 'course_name', old.course_name, 'room', old.room,
          'customer_name', old.customer_name));
    end if;
    return new;
  end if;

  -- 確定になった（WEB予約の受付など）
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    if old.status is distinct from 'completed' and new.cast_id is not null then
      perform private.enqueue_therapist_notification(new.store_id, new.cast_id, new.id, 'new');
    end if;
    return new;
  end if;

  if new.status <> 'confirmed' or old.status <> 'confirmed' then
    return new;
  end if;

  -- 担当が変わった：前の担当には取り消し、新しい担当には新しい予約として知らせる
  if new.cast_id is distinct from old.cast_id then
    if old.cast_id is not null then
      perform private.enqueue_therapist_notification(old.store_id, old.cast_id, old.id, 'cancelled', '{}'::jsonb,
        jsonb_build_object('reservation_date', old.reservation_date, 'start_time', old.start_time,
          'duration', old.duration, 'course_name', old.course_name, 'room', old.room,
          'customer_name', old.customer_name, 'reason', 'cast_changed'));
    end if;
    if new.cast_id is not null then
      perform private.enqueue_therapist_notification(new.store_id, new.cast_id, new.id, 'new');
    end if;
    return new;
  end if;

  if new.cast_id is null then
    return new;
  end if;

  -- 内容の変更（変更前の値を残す）
  if new.reservation_date is distinct from old.reservation_date then
    v_changes := v_changes || jsonb_build_object('reservation_date', old.reservation_date);
  end if;
  if new.start_time is distinct from old.start_time then
    v_changes := v_changes || jsonb_build_object('start_time', old.start_time);
  end if;
  if new.duration is distinct from old.duration then
    v_changes := v_changes || jsonb_build_object('duration', old.duration);
  end if;
  if new.course_name is distinct from old.course_name then
    v_changes := v_changes || jsonb_build_object('course_name', old.course_name);
  end if;
  if new.room is distinct from old.room then
    v_changes := v_changes || jsonb_build_object('room', old.room);
  end if;
  if new.options is distinct from old.options then
    v_changes := v_changes || jsonb_build_object('options', to_jsonb(old.options));
  end if;
  if new.customer_name is distinct from old.customer_name then
    v_changes := v_changes || jsonb_build_object('customer_name', old.customer_name);
  end if;
  if v_changes <> '{}'::jsonb then
    perform private.enqueue_therapist_notification(new.store_id, new.cast_id, new.id, 'changed', v_changes);
  end if;
  return new;
exception when others then
  raise warning 'therapist notification skipped: %', sqlerrm;
  return new;
end;
$$;

create trigger reservations_therapist_notification
  after insert or update on public.reservations
  for each row execute function public.trg_enqueue_therapist_notification();

-- ── Edge Function を呼ぶ（送るものがあるときだけ） ─────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'therapist_notify_internal_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'therapist_notify_internal_secret',
      'Authenticates pg_cron calls to notify-therapist'
    );
  end if;
end;
$$;

create or replace function public.verify_therapist_notify_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate is not null
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'therapist_notify_internal_secret' and decrypted_secret = candidate
    );
$$;
revoke all on function public.verify_therapist_notify_secret(text) from public, anon, authenticated;
grant execute on function public.verify_therapist_notify_secret(text) to service_role;

create or replace function private.dispatch_therapist_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint;
begin
  -- 途中で止まった送信を戻す（3回まで）
  update public.therapist_notifications
  set status = case when attempts >= 3 then 'failed' else 'queued' end,
      error_message = case when attempts >= 3 then coalesce(error_message, '送信が途中で止まりました') else error_message end,
      available_at = now(),
      updated_at = now()
  where status = 'sending' and updated_at < now() - interval '5 minutes';

  if not exists (
    select 1 from public.therapist_notifications
    where status = 'queued' and available_at <= now()
  ) then
    return null;
  end if;

  select net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/notify-therapist',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-therapist-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'therapist_notify_internal_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_therapist_notifications() from public, anon, authenticated;

-- Edge Function が送る分を取る（同時に2回呼ばれても同じ通知を二重に送らない）
create or replace function public.claim_therapist_notifications(p_limit integer default 20)
returns setof public.therapist_notifications
language sql
security definer
set search_path = ''
as $$
  update public.therapist_notifications as notification
  set status = 'sending', attempts = notification.attempts + 1, updated_at = now()
  where notification.id in (
    select due.id from public.therapist_notifications as due
    where due.status = 'queued' and due.available_at <= now()
    order by due.available_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning notification.*;
$$;
revoke all on function public.claim_therapist_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_therapist_notifications(integer) to service_role;

-- ── 管理画面から ─────────────────────────────────────────────
-- セラピストにもう一度知らせる
create or replace function public.resend_therapist_notification(p_reservation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_id uuid;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id;
  if v_reservation.id is null or not public.can_manage_store(v_reservation.store_id) then
    raise exception 'この予約は操作できません' using errcode = '42501';
  end if;
  if v_reservation.status <> 'confirmed' or v_reservation.cast_id is null then
    raise exception '担当セラピストが決まっている確定済みの予約だけ再通知できます' using errcode = '22023';
  end if;
  insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, source, available_at)
  values (v_reservation.store_id, v_reservation.cast_id, v_reservation.id, 'new', 'manual', now())
  returning id into v_id;
  perform private.dispatch_therapist_notifications();
  return v_id;
end;
$$;
revoke all on function public.resend_therapist_notification(uuid) from public, anon;
grant execute on function public.resend_therapist_notification(uuid) to authenticated;

-- 届かなかった通知を「確認した（セラピストに直接連絡した等）」にする
create or replace function public.acknowledge_therapist_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.therapist_notifications
  set acknowledged_at = now(), acknowledged_by = auth.uid(), updated_at = now()
  where id = any (coalesce(p_ids, '{}'::uuid[]))
    and acknowledged_at is null
    and public.can_manage_store(store_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.acknowledge_therapist_notifications(uuid[]) from public, anon;
grant execute on function public.acknowledge_therapist_notifications(uuid[]) to authenticated;

-- ── セラピストのマイページから（本人のトークンで） ──────────────────────
create or replace function public.save_therapist_push_subscription(
  p_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast public.casts;
  v_id uuid;
begin
  select * into v_cast from public.casts
  where access_token = p_token and coalesce(p_token, '') <> ''
  limit 1;
  if v_cast.id is null then
    raise exception 'マイページのURLが正しくありません' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(coalesce(p_p256dh, '')) > 200
     or length(coalesce(p_auth, '')) > 100 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception '通知の登録情報が正しくありません' using errcode = '22023';
  end if;
  insert into public.therapist_push_subscriptions (store_id, cast_id, endpoint, p256dh, auth, device_label)
  values (v_cast.store_id, v_cast.id, p_endpoint, p_p256dh, p_auth, left(p_device_label, 100))
  on conflict (endpoint) do update set
    store_id = excluded.store_id,
    cast_id = excluded.cast_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    device_label = excluded.device_label,
    updated_at = now(),
    failure_count = 0,
    last_error = null
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.save_therapist_push_subscription(text, text, text, text, text) from public;
grant execute on function public.save_therapist_push_subscription(text, text, text, text, text) to anon, authenticated;

create or replace function public.delete_therapist_push_subscription(p_token text, p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.therapist_push_subscriptions as subscription
  using public.casts as cast_record
  where subscription.endpoint = p_endpoint
    and cast_record.id = subscription.cast_id
    and cast_record.access_token = p_token
    and coalesce(p_token, '') <> '';
  return found;
end;
$$;
revoke all on function public.delete_therapist_push_subscription(text, text) from public;
grant execute on function public.delete_therapist_push_subscription(text, text) to anon, authenticated;

create or replace function public.get_therapist_push_status(p_token text, p_endpoint text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'devices', count(subscription.id),
    'this_device', coalesce(bool_or(subscription.endpoint = p_endpoint), false)
  )
  from public.casts as cast_record
  left join public.therapist_push_subscriptions as subscription on subscription.cast_id = cast_record.id
  where cast_record.access_token = p_token and coalesce(p_token, '') <> '';
$$;
revoke all on function public.get_therapist_push_status(text, text) from public;
grant execute on function public.get_therapist_push_status(text, text) to anon, authenticated;

-- ── 管理画面のスマホ通知：「セラピストに予約通知が届かないとき」を足す ───────────
alter table public.push_subscriptions
  alter column topics set default array['web_booking', 'sms_reply', 'sms_balance', 'estama_scout', 'therapist_notify'];
update public.push_subscriptions
set topics = array_append(topics, 'therapist_notify')
where not ('therapist_notify' = any (topics));

-- ── 30秒ごとの実行 ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'therapist-notify-every-30-seconds') then
    perform cron.unschedule('therapist-notify-every-30-seconds');
  end if;
  perform cron.schedule(
    'therapist-notify-every-30-seconds',
    '30 seconds',
    $job$select private.dispatch_therapist_notifications();$job$
  );
end;
$$;
