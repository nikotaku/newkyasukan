-- サブスクの見張り（支払い管理 /payments の「サブスクの見張り」）
--   登録したサブスクごとに、課金が止まっていないかを1時間ごとに判定してスマホ通知する。
--   判定は Edge Function subscription-check（src/lib/subscriptionWatch.ts の evaluateWatch）：
--     - サービスに直接たずねる：Twilio のアカウントの状態・SUBLINE のAPI・URLが開けるか・エステ魂の契約期間
--     - メール：Gmail の取り込み（report-email-ingest）で、支払い失敗・停止の知らせ（billing_failed）と領収書・請求（billing_paid）を見分ける
--     - 使われている形跡：IVRy の着信通知が何日も届かない
--     - 日付：次の請求日を過ぎても支払いを確認できない・登録カードの有効期限
--   悪くなったら subscription_alerts に1行 → スマホ通知（topic subscription）

create table if not exists public.subscription_watches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  service text not null default 'other',
  name text not null,
  plan text,
  amount integer,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  next_billing_date date,
  payment_method text,
  card_expiry text check (card_expiry is null or card_expiry ~ '^\d{4}-\d{2}$'),
  manage_url text,
  check_url text,
  mail_keywords text[] not null default '{}',
  silence_days integer check (silence_days is null or silence_days between 1 and 60),
  notes text,
  is_active boolean not null default true,
  level text not null default 'unknown' check (level in ('ok', 'warning', 'stopped', 'unknown')),
  reasons text[] not null default '{}',
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  last_paid_at timestamptz,
  alerted_level text,
  alerted_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subscription_watches_store on public.subscription_watches (store_id, is_active);

drop trigger if exists trg_set_store_id on public.subscription_watches;
create trigger trg_set_store_id before insert on public.subscription_watches
  for each row execute function public.set_store_id();

alter table public.subscription_watches enable row level security;
revoke all on public.subscription_watches from anon;
grant select, insert, update, delete on public.subscription_watches to authenticated;
drop policy if exists subscription_watches_rw on public.subscription_watches;
create policy subscription_watches_rw on public.subscription_watches for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

create table if not exists public.subscription_alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  watch_id uuid not null references public.subscription_watches(id) on delete cascade,
  level text not null check (level in ('warning', 'stopped')),
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.subscription_alerts enable row level security;
revoke all on public.subscription_alerts from anon;
grant select on public.subscription_alerts to authenticated;
drop policy if exists subscription_alerts_read on public.subscription_alerts;
create policy subscription_alerts_read on public.subscription_alerts for select to authenticated
  using (store_id in (select public.current_store_ids()));

-- 「支払いを確認」：最後に払った日を今日にし、次の請求日を1周期すすめる
create or replace function public.mark_subscription_paid(p_id uuid)
returns public.subscription_watches
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.subscription_watches;
begin
  select * into v_row from public.subscription_watches where id = p_id;
  if v_row.id is null or v_row.store_id not in (select public.current_store_ids()) then
    raise exception using message = '見つかりません', errcode = '42501';
  end if;
  update public.subscription_watches
  set last_paid_at = now(),
      next_billing_date = case
        when next_billing_date is null then null
        when billing_cycle = 'yearly' then (next_billing_date + interval '1 year')::date
        else (next_billing_date + interval '1 month')::date
      end,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end
$$;
revoke all on function public.mark_subscription_paid(uuid) from public, anon;
grant execute on function public.mark_subscription_paid(uuid) to authenticated;

-- エステ魂の「ご契約期間：YYYY年MM月DD日 HH:MM まで」（仮予約の取り込みのついでに読む）
alter table public.automation_connections add column if not exists contract_until timestamptz;
alter table public.automation_connections add column if not exists contract_checked_at timestamptz;

create or replace function public.save_estama_contract_info(p_run_token text, p_until timestamptz)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' or p_until is null then return false; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then return false; end if;
  update public.automation_connections
  set contract_until = p_until, contract_checked_at = now()
  where store_id = v_store and provider = 'estama';
  return true;
end
$$;
revoke all on function public.save_estama_contract_info(text, timestamptz) from public;
grant execute on function public.save_estama_contract_info(text, timestamptz) to anon, authenticated;

-- メールの種類：エステ魂の仮予約（取り込みで使っていたのに制約に無かった）・請求まわり
alter table public.report_email_messages drop constraint if exists report_email_messages_kind_check;
alter table public.report_email_messages add constraint report_email_messages_kind_check
  check (kind in ('ivry_call', 'estama_daily_report', 'estama_reservation', 'billing_failed', 'billing_paid', 'unknown'));
create index if not exists idx_report_email_messages_kind on public.report_email_messages (store_id, kind, received_at desc);

-- Edge Function subscription-check を呼ぶ合言葉
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'subscription_check_internal_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'subscription_check_internal_secret', 'pg_cron → subscription-check');
  end if;
end
$$;

create or replace function public.verify_subscription_check_secret(candidate text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select candidate is not null and exists (
    select 1 from vault.decrypted_secrets where name = 'subscription_check_internal_secret' and decrypted_secret = candidate
  );
$$;
revoke all on function public.verify_subscription_check_secret(text) from public, anon, authenticated;
grant execute on function public.verify_subscription_check_secret(text) to service_role;

-- 1時間ごと（毎時13分）：見張るサブスクがあるときだけ呼ぶ
create or replace function private.dispatch_subscription_check()
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.subscription_watches where is_active) then return 0; end if;
  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/subscription-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-subscription-check-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'subscription_check_internal_secret')
    ),
    body := jsonb_build_object('action', 'cron'),
    timeout_milliseconds := 120000
  );
  return 1;
end
$$;
revoke all on function private.dispatch_subscription_check() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'subscription-check-hourly';
select cron.schedule('subscription-check-hourly', '13 * * * *', $$select private.dispatch_subscription_check()$$);

-- スマホ通知：trg_push_notify に subscription_alerts を足す（topic subscription）
create or replace function public.trg_push_notify()
returns trigger
language plpgsql security definer set search_path = 'public', 'extensions' as $function$
declare
  v_event text;
  v_store uuid;
  v_id uuid;
  v_resubmitted boolean := false;
  v_topic text;
begin
  if tg_table_name = 'reservations' then
    if new.booking_origin not in ('web_form', 'cast_form') then return new; end if;
    v_event := 'web_booking'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'sms_logs' then
    if new.direction is distinct from 'inbound' then return new; end if;
    v_event := 'sms_reply'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'sms_balance_alerts' then
    v_event := 'sms_balance'; v_id := new.id;
  elsif tg_table_name = 'daily_sales_records' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'daily_sales'; v_store := new.store_id; v_id := new.id; v_resubmitted := tg_op = 'UPDATE';
  elsif tg_table_name = 'settlement_approvals' then
    if new.shortage_method is distinct from 'transfer' or new.shortage_settled_at is not null then return new; end if;
    v_event := 'settlement_transfer'; v_store := new.store_id; v_id := new.clearance_id;
  elsif tg_table_name = 'cast_bank_accounts' then
    select a.clearance_id, a.store_id into v_id, v_store from public.settlement_approvals a
    where a.cast_id = new.cast_id and a.shortage_method = 'transfer' and a.shortage_settled_at is null and a.shortage_amount > 0
    order by a.date desc limit 1;
    if v_id is null then return new; end if;
    v_event := 'settlement_transfer';
  elsif tg_table_name = 'estama_login_alerts' then
    v_event := 'estama_login'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'line_customer_messages' then
    if new.direction is distinct from 'in' then return new; end if;
    v_event := 'line_inbox'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'line_customer_threads' then
    if new.status is distinct from 'failed' or old.status is not distinct from 'failed' then return new; end if;
    v_event := 'line_inbox_failed'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'subscription_alerts' then
    v_event := 'subscription'; v_store := new.store_id; v_id := new.id;
  else
    return new;
  end if;
  v_topic := case when v_event = 'settlement_transfer' then 'daily_sales' when v_event = 'line_inbox_failed' then 'line_inbox' else v_event end;
  if not exists (
    select 1 from public.push_subscriptions s where v_topic = any (s.topics) and (v_store is null or s.store_id = v_store)
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

drop trigger if exists subscription_alerts_push_notify on public.subscription_alerts;
create trigger subscription_alerts_push_notify after insert on public.subscription_alerts
  for each row execute function public.trg_push_notify();

-- 今まで登録されていた端末にも、この通知を足す（全部の種類を受け取っている端末だけ）
update public.push_subscriptions
set topics = array_append(topics, 'subscription')
where not ('subscription' = any (topics))
  and topics @> array['web_booking', 'sms_reply', 'sms_balance', 'estama_login']::text[];
