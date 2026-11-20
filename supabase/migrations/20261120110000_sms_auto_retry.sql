-- SMSが送れなかった・届かなかったときに、届くまで自動で送り直す（2026-11-20）。
-- ・送り直すのは、たまたま届かなかったもの（30003 圏外・30008 携帯会社側 など）。番号が無い・固定電話・受信拒否など、
--   送り直しても届かないもの（21211/21408/21610/21612/21614/30004/30005/30006）は送り直さず、すぐ知らせる（not_retryable）
-- ・間隔は 2分 → 5分 → 15分 → 30分 → 1時間 → 2時間（最大6回）。予約の開始時刻を過ぎた・予約が取り消された・
--   最初の送信から12時間たったものはやめる。6回でも届かなければ gave_up にして知らせる
-- ・送り直しは新しい sms_logs の行（retry_of = 最初の行、retry_count = 何回目）。前日リマインドの重複防止キーは付けない
-- 流れ：sms_logs の status が failed / undelivered になる → private.sms_schedule_retry（BEFORE）が next_retry_at を入れる
--   → pg_cron sms-retry-every-minute → private.dispatch_sms_retries() → Edge Function send-sms（action retry）

alter table public.sms_logs
  add column if not exists retry_of uuid references public.sms_logs(id) on delete set null,
  add column if not exists retry_count integer not null default 0,
  add column if not exists retry_state text,
  add column if not exists next_retry_at timestamptz;

do $$ begin
  alter table public.sms_logs add constraint sms_logs_retry_state_check
    check (retry_state is null or retry_state in ('scheduled', 'sending', 'done', 'gave_up', 'not_retryable', 'stopped'));
exception when duplicate_object then null; end $$;

create index if not exists sms_logs_retry_due_idx on public.sms_logs (next_retry_at) where retry_state = 'scheduled';
create index if not exists sms_logs_retry_of_idx on public.sms_logs (retry_of) where retry_of is not null;

create or replace function private.sms_schedule_retry()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_root uuid := coalesce(new.retry_of, new.id);
  v_started timestamptz;
  v_res record;
  v_backoff integer[] := array[2, 5, 15, 30, 60, 120];
begin
  if new.direction = 'inbound' or new.status not in ('failed', 'undelivered') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('failed', 'undelivered') then return new; end if;

  -- 送り直しても届かない（番号・受け取り側の問題）
  if coalesce(new.error_code, '') in ('21211', '21408', '21610', '21612', '21614', '30004', '30005', '30006') then
    new.retry_state := 'not_retryable'; new.next_retry_at := null; return new;
  end if;

  select coalesce(min(l.created_at), new.created_at) into v_started from public.sms_logs l where l.id = v_root;
  if new.reservation_id is not null then
    select r.status, r.reservation_date, r.start_time into v_res from public.reservations r where r.id = new.reservation_id;
    if v_res.status = 'cancelled' then
      new.retry_state := 'stopped'; new.next_retry_at := null; return new;
    end if;
    if v_res.reservation_date is not null and v_res.start_time is not null
       and ((v_res.reservation_date + v_res.start_time) at time zone 'Asia/Tokyo') < now() then
      new.retry_state := 'gave_up'; new.next_retry_at := null; return new;
    end if;
  end if;
  if new.retry_count >= array_length(v_backoff, 1) or v_started < now() - interval '12 hours' then
    new.retry_state := 'gave_up'; new.next_retry_at := null; return new;
  end if;

  new.retry_state := 'scheduled';
  new.next_retry_at := now() + make_interval(mins => v_backoff[new.retry_count + 1]);
  return new;
end;
$function$;

create or replace trigger sms_logs_schedule_retry
  before insert or update of status on public.sms_logs
  for each row execute function private.sms_schedule_retry();

-- 送り直しで届いたら、予約の「SMS送信」を送信済みに戻す
create or replace function private.sms_retry_delivered()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.retry_of is not null and new.status = 'delivered' and old.status is distinct from 'delivered' and new.reservation_id is not null then
    update public.reservations set sms_notification_status = 'sent', sms_notification_sent_at = now() where id = new.reservation_id;
  end if;
  return new;
end;
$function$;

create or replace trigger sms_logs_retry_delivered
  after update of status on public.sms_logs
  for each row execute function private.sms_retry_delivered();

-- 毎分：送り直しの時間が来たものを send-sms へ（1回に10件まで）
create or replace function private.dispatch_sms_retries()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  v_secret text;
  v_count integer := 0;
begin
  -- 送り直しを頼んだのに10分たっても終わっていないもの（Edge Function が落ちた等）は、もう一度送る対象に戻す
  update public.sms_logs set retry_state = 'scheduled', next_retry_at = now()
  where retry_state = 'sending' and updated_at < now() - interval '10 minutes';

  if not exists (select 1 from public.sms_logs where retry_state = 'scheduled' and next_retry_at <= now()) then
    return 0;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_sms_internal_secret';
  if v_secret is null then return 0; end if;

  for r in
    update public.sms_logs l set retry_state = 'sending', updated_at = now()
    where l.id in (
      select id from public.sms_logs
      where retry_state = 'scheduled' and next_retry_at <= now()
      order by next_retry_at limit 10
      for update skip locked
    )
    returning l.id
  loop
    perform net.http_post(
      url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/send-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
        'x-send-sms-secret', v_secret
      ),
      body := jsonb_build_object('action', 'retry', 'retry_log_id', r.id),
      timeout_milliseconds := 30000
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.dispatch_sms_retries() from public, anon, authenticated;
revoke all on function private.sms_schedule_retry() from public, anon, authenticated;
revoke all on function private.sms_retry_delivered() from public, anon, authenticated;

select cron.schedule('sms-retry-every-minute', '* * * * *', $$select private.dispatch_sms_retries();$$);

-- スマホ通知：最初の失敗（自動で送り直します）・送り直しても届かない番号・送り直しても届かなかった・送り直しで届いた、のときだけ知らせる。
-- 送り直し中の2回目以降の失敗は知らせない（通知が増えすぎないように）
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
    v_event := 'web_booking'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'sms_logs' then
    if new.direction = 'inbound' then
      if tg_op <> 'INSERT' then return new; end if;
      v_event := 'sms_reply';
    elsif new.status = 'delivered' and new.retry_of is not null then
      if tg_op = 'UPDATE' and old.status = 'delivered' then return new; end if;
      v_event := 'sms_retry_delivered';
    elsif new.status in ('failed', 'undelivered') then
      if tg_op = 'UPDATE' and old.status in ('failed', 'undelivered') then return new; end if;
      if not (new.retry_state is null or new.retry_state in ('not_retryable', 'gave_up')
              or (new.retry_state = 'scheduled' and new.retry_count = 0)) then
        return new;
      end if;
      v_event := 'sms_failed';
    else
      return new;
    end if;
    v_store := new.store_id; v_id := new.id;
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
  v_topic := case
    when v_event = 'settlement_transfer' then 'daily_sales'
    when v_event = 'line_inbox_failed' then 'line_inbox'
    when v_event in ('sms_failed', 'sms_retry_delivered') then 'sms_reply'
    else v_event end;
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
