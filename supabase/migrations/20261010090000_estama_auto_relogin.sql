-- エステ魂の自動再ログイン
-- エステ魂の管理画面のログイン（Browserbase に保存したブラウザ状態）は2か月ほどで切れる。
-- 切れたら（automation_connections.status = 'expired'）、店舗が登録したメールアドレス・パスワードで自動でログインし直す。
--   ログイン情報 : Vault の estama_admin_login:<store_id>（{"mail","password"}）。画面には「登録済み」とメールの一部だけ返す
--   状態         : private.estama_relogin_state（最後に試した・成功した日時、続けて失敗した回数）
--   流れ         : pg_cron estama-relogin-every-5-minutes → private.dispatch_estama_relogin()
--                  → Vercel /api/cron/estama-appeal?action=estama-relogin（一回限りのトークン）
--                  → claim_estama_relogin_run（ログイン情報と実行トークン）→ ログイン → finish_estama_relogin_run
--   通知         : 3回続けて失敗・ログイン情報が無い → estama_login_alerts → スマホ通知（topic estama_login）

create table if not exists private.estama_relogin_state (
  store_id uuid primary key references public.stores(id) on delete cascade,
  credentials_set_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  alerted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.estama_relogin_runs (
  token_hash text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  expires_at timestamptz not null,
  finished_at timestamptz
);

create table if not exists public.estama_login_alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kind text not null check (kind in ('relogin_failed', 'no_credentials')),
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.estama_login_alerts enable row level security;
revoke all on public.estama_login_alerts from anon, authenticated;
grant select on public.estama_login_alerts to authenticated;
create policy estama_login_alerts_member_read on public.estama_login_alerts
  for select to authenticated
  using (store_id in (select public.current_store_ids()));

create or replace function private.estama_admin_login_name(p_store_id uuid)
returns text language sql immutable as $$ select 'estama_admin_login:' || p_store_id::text $$;

create or replace function private.estama_admin_login(p_store_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = private.estama_admin_login_name(p_store_id);
  if coalesce(v_secret, '') = '' then
    return null;
  end if;
  return v_secret::jsonb;
exception when others then
  return null;
end
$$;

-- メールは先頭2文字と@以降だけ見せる
create or replace function private.mask_mail(p_mail text)
returns text language sql immutable as $$
  select case
    when p_mail is null or position('@' in p_mail) = 0 then null
    else left(split_part(p_mail, '@', 1), 2) || '***@' || split_part(p_mail, '@', 2)
  end
$$;

create or replace function public.get_estama_admin_login_status(p_store_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_login jsonb;
  v_state private.estama_relogin_state;
begin
  if auth.uid() is null or p_store_id not in (select public.current_store_ids()) then
    raise exception 'この店舗の設定は見られません' using errcode = '42501';
  end if;
  v_login := private.estama_admin_login(p_store_id);
  select * into v_state from private.estama_relogin_state where store_id = p_store_id;
  return jsonb_build_object(
    'registered', v_login is not null,
    'mail', private.mask_mail(v_login ->> 'mail'),
    'credentialsSetAt', v_state.credentials_set_at,
    'lastAttemptAt', v_state.last_attempt_at,
    'lastSuccessAt', v_state.last_success_at,
    'consecutiveFailures', coalesce(v_state.consecutive_failures, 0),
    'lastError', v_state.last_error
  );
end
$$;

create or replace function public.save_estama_admin_login(p_store_id uuid, p_mail text, p_password text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := private.estama_admin_login_name(p_store_id);
  v_value text;
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'ログイン情報を登録できるのは店長・オーナーだけです' using errcode = '42501';
  end if;
  p_mail := btrim(coalesce(p_mail, ''));
  if p_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_mail) > 200 then
    raise exception 'メールアドレスの形が正しくありません' using errcode = '22023';
  end if;
  if coalesce(p_password, '') = '' or length(p_password) > 200 then
    raise exception 'パスワードを入れてください' using errcode = '22023';
  end if;
  v_value := jsonb_build_object('mail', p_mail, 'password', p_password)::text;

  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_value, v_name, 'エステ魂 管理画面のログイン（自動再ログイン用）');
  else
    perform vault.update_secret(v_id, v_value);
  end if;

  insert into private.estama_relogin_state (store_id, credentials_set_at, consecutive_failures, last_error, alerted_at, last_attempt_at, updated_at)
  values (p_store_id, now(), 0, null, null, null, now())
  on conflict (store_id) do update
  set credentials_set_at = now(), consecutive_failures = 0, last_error = null, alerted_at = null,
      last_attempt_at = null, updated_at = now();

  return public.get_estama_admin_login_status(p_store_id);
end
$$;

-- やめるときは値を空にする（空は未登録扱い）
create or replace function public.clear_estama_admin_login(p_store_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'ログイン情報を消せるのは店長・オーナーだけです' using errcode = '42501';
  end if;
  select id into v_id from vault.secrets where name = private.estama_admin_login_name(p_store_id);
  if v_id is not null then
    perform vault.update_secret(v_id, '');
  end if;
  update private.estama_relogin_state set credentials_set_at = null, updated_at = now() where store_id = p_store_id;
  return public.get_estama_admin_login_status(p_store_id);
end
$$;

-- 一回限りのトークン → ログイン情報と実行トークン（Vercel のワーカーだけが受け取る）
create or replace function public.claim_estama_relogin_run(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_purpose text;
  v_store_id uuid;
  v_connection public.automation_connections;
  v_login jsonb;
  v_run_token text;
  v_run_hash text;
  v_rows integer;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  update public.estama_sync_tokens
  set used_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and purpose like 'estama-relogin:%'
    and used_at is null
    and expires_at > now()
  returning purpose into v_purpose;
  if v_purpose is null
     or substr(v_purpose, 16) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_store_id := substr(v_purpose, 16)::uuid;

  select * into v_connection from public.automation_connections
  where store_id = v_store_id and provider = 'estama';
  if v_connection.id is null or v_connection.browserbase_context_id is null then
    return jsonb_build_object('storeId', v_store_id, 'unavailable', true, 'reason', 'エステ魂の自動化が未設定です');
  end if;
  if v_connection.status = 'ready' then
    return jsonb_build_object('storeId', v_store_id, 'unavailable', true, 'reason', 'すでにログイン済みです');
  end if;
  v_login := private.estama_admin_login(v_store_id);
  if v_login is null then
    return jsonb_build_object('storeId', v_store_id, 'unavailable', true, 'reason', 'ログイン情報が未登録です');
  end if;

  v_run_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_run_hash := encode(extensions.digest(v_run_token, 'sha256'), 'hex');

  insert into private.estama_context_leases as lease (store_id, owner_token, operation, acquired_at, expires_at)
  values (v_store_id, v_run_hash, 'estama-relogin', now(), now() + interval '4 minutes')
  on conflict (store_id) do update
  set owner_token = excluded.owner_token, operation = excluded.operation,
      acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
  where lease.expires_at <= now();
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('storeId', v_store_id, 'deferred', true, 'reason', '別のエスたま処理が実行中です');
  end if;

  insert into private.estama_relogin_runs (token_hash, store_id, expires_at)
  values (v_run_hash, v_store_id, now() + interval '6 minutes');

  return jsonb_build_object(
    'runToken', v_run_token,
    'storeId', v_store_id,
    'contextId', v_connection.browserbase_context_id,
    'mail', v_login ->> 'mail',
    'password', v_login ->> 'password'
  );
end
$$;

create or replace function public.finish_estama_relogin_run(p_run_token text, p_ok boolean, p_error text default null, p_shop_id text default null)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_run_token, ''), 'sha256'), 'hex');
  v_store_id uuid;
  v_state private.estama_relogin_state;
begin
  update private.estama_relogin_runs
  set finished_at = now()
  where token_hash = v_hash and expires_at > now() and finished_at is null
  returning store_id into v_store_id;
  if v_store_id is null then
    raise exception '実行トークンが無効です' using errcode = '42501';
  end if;
  -- ブラウザ状態の貸し出しを返す（期限を今にする）
  update private.estama_context_leases set expires_at = now()
  where store_id = v_store_id and owner_token = v_hash;

  if p_ok then
    update public.automation_connections
    set status = 'ready',
        shop_id = coalesce(nullif(p_shop_id, ''), shop_id),
        last_verified_at = now(),
        last_error = null,
        setup_session_id = null,
        updated_at = now()
    where store_id = v_store_id and provider = 'estama';
    -- ログイン待ちで止まっていた作業を再開する
    update public.automation_jobs
    set status = 'queued', available_at = now(), error_message = null
    where store_id = v_store_id and provider = 'estama' and status = 'waiting_for_login';
    update private.estama_relogin_state
    set last_success_at = now(), consecutive_failures = 0, last_error = null, alerted_at = null, updated_at = now()
    where store_id = v_store_id;
    return true;
  end if;

  update private.estama_relogin_state
  set consecutive_failures = consecutive_failures + 1,
      last_error = left(coalesce(p_error, '自動ログインに失敗しました'), 500),
      updated_at = now()
  where store_id = v_store_id
  returning * into v_state;
  update public.automation_connections
  set last_error = '自動再ログインに失敗：' || left(coalesce(p_error, ''), 300), updated_at = now()
  where store_id = v_store_id and provider = 'estama';

  if v_state.consecutive_failures >= 3 and v_state.alerted_at is null then
    insert into public.estama_login_alerts (store_id, kind, message)
    values (v_store_id, 'relogin_failed', left(coalesce(p_error, '自動ログインに失敗しました'), 300));
    update private.estama_relogin_state set alerted_at = now() where store_id = v_store_id;
  end if;
  return true;
end
$$;

-- 5分ごと：ログインが切れている店舗で、ログイン情報があれば自動でログインし直す
--   続けて失敗したら間をあける（1・2回目は10分、3回目以降は6時間）
--   ログイン情報が無い店舗は1日1回だけ知らせる
create or replace function private.dispatch_estama_relogin()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_raw_token text;
  v_calls integer := 0;
begin
  for r in
    select connection.store_id, state.last_attempt_at, coalesce(state.consecutive_failures, 0) as failures,
           state.alerted_at, private.estama_admin_login(connection.store_id) is not null as has_login
    from public.automation_connections as connection
    left join private.estama_relogin_state as state on state.store_id = connection.store_id
    where connection.provider = 'estama'
      and connection.status in ('expired', 'error')
      and connection.browserbase_context_id is not null
      and (connection.status = 'expired' or connection.last_error ilike '%ログイン%')
  loop
    if not r.has_login then
      if not exists (
        select 1 from public.estama_login_alerts a
        where a.store_id = r.store_id and a.kind = 'no_credentials' and a.created_at > now() - interval '1 day'
      ) then
        insert into public.estama_login_alerts (store_id, kind, message)
        values (r.store_id, 'no_credentials', 'エステ魂のログインが切れています。自動再ログイン用のメールアドレス・パスワードが未登録です');
      end if;
      continue;
    end if;
    if r.last_attempt_at is not null
       and r.last_attempt_at > now() - case when r.failures >= 3 then interval '6 hours' else interval '10 minutes' end then
      continue;
    end if;

    insert into private.estama_relogin_state (store_id, last_attempt_at, updated_at)
    values (r.store_id, now(), now())
    on conflict (store_id) do update set last_attempt_at = now(), updated_at = now();

    v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.estama_sync_tokens (token_hash, purpose, expires_at)
    values (encode(extensions.digest(v_raw_token, 'sha256'), 'hex'), 'estama-relogin:' || r.store_id::text, now() + interval '10 minutes');
    perform net.http_post(
      url := 'https://newkyasukan.vercel.app/api/cron/estama-appeal?action=estama-relogin',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('token', v_raw_token),
      timeout_milliseconds := 300000
    );
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end
$$;

revoke all on function private.estama_admin_login(uuid) from public, anon, authenticated;
revoke all on function private.dispatch_estama_relogin() from public, anon, authenticated;
revoke all on function public.get_estama_admin_login_status(uuid) from public, anon;
revoke all on function public.save_estama_admin_login(uuid, text, text) from public, anon;
revoke all on function public.clear_estama_admin_login(uuid) from public, anon;
grant execute on function public.get_estama_admin_login_status(uuid) to authenticated;
grant execute on function public.save_estama_admin_login(uuid, text, text) to authenticated;
grant execute on function public.clear_estama_admin_login(uuid) to authenticated;
-- ワーカー（公開鍵）から呼ぶ。一回限りのトークン・実行トークンで守る
revoke all on function public.claim_estama_relogin_run(text) from public;
revoke all on function public.finish_estama_relogin_run(text, boolean, text, text) from public;
grant execute on function public.claim_estama_relogin_run(text) to anon, authenticated;
grant execute on function public.finish_estama_relogin_run(text, boolean, text, text) to anon, authenticated;

select cron.schedule('estama-relogin-every-5-minutes', '1-56/5 * * * *', 'select private.dispatch_estama_relogin();');

-- 通知：既存の購読にも「エステ魂のログイン」を足す（運用上の大事な知らせなので）
update public.push_subscriptions
set topics = array_append(topics, 'estama_login')
where not ('estama_login' = any (topics));

-- スマホ通知のトリガーに「エステ魂のログイン」を足す（既存の分岐はそのまま）
create or replace function public.trg_push_notify()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_event text;
  v_store uuid;
  v_id uuid;
  v_resubmitted boolean := false;
  v_topic text;
begin
  if tg_table_name = 'reservations' then
    if new.booking_origin not in ('web_form', 'cast_form') then return new; end if;
    v_event := 'web_booking';
    v_store := new.store_id;
    v_id := new.id;
  elsif tg_table_name = 'sms_logs' then
    if new.direction is distinct from 'inbound' then return new; end if;
    v_event := 'sms_reply';
    v_store := new.store_id;
    v_id := new.id;
  elsif tg_table_name = 'sms_balance_alerts' then
    v_event := 'sms_balance';
    v_id := new.id;
  elsif tg_table_name = 'daily_sales_records' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'daily_sales';
    v_store := new.store_id;
    v_id := new.id;
    v_resubmitted := tg_op = 'UPDATE';
  elsif tg_table_name = 'settlement_approvals' then
    if new.shortage_method is distinct from 'transfer' or new.shortage_settled_at is not null then return new; end if;
    v_event := 'settlement_transfer';
    v_store := new.store_id;
    v_id := new.clearance_id;
  elsif tg_table_name = 'cast_bank_accounts' then
    -- 振込を選んでから振込先を入れたとき（まだ払っていない一番新しい不足分について知らせる）
    select a.clearance_id, a.store_id into v_id, v_store
    from public.settlement_approvals a
    where a.cast_id = new.cast_id
      and a.shortage_method = 'transfer'
      and a.shortage_settled_at is null
      and a.shortage_amount > 0
    order by a.date desc
    limit 1;
    if v_id is null then return new; end if;
    v_event := 'settlement_transfer';
  elsif tg_table_name = 'estama_login_alerts' then
    v_event := 'estama_login';
    v_store := new.store_id;
    v_id := new.id;
  else
    return new;
  end if;

  -- 振込の希望は精算の通知（daily_sales）を受け取っている端末へ
  v_topic := case when v_event = 'settlement_transfer' then 'daily_sales' else v_event end;
  if not exists (
    select 1 from public.push_subscriptions s
    where v_topic = any (s.topics) and (v_store is null or s.store_id = v_store)
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
    body := jsonb_build_object('event', v_event, 'id', v_id, 'resubmitted', v_resubmitted)
  );
  return new;
exception when others then
  raise warning 'push notify skipped: %', sqlerrm;
  return new;
end;
$function$;

create trigger estama_login_alerts_push_notify
  after insert on public.estama_login_alerts
  for each row execute function public.trg_push_notify();
