-- お客様へのSMSが送れなかった・届かなかったときにスマホ通知（2026-11-20）。
-- send-sms が Twilio に断られたとき（status = failed）と、あとから Twilio が「届かなかった」と知らせてきたとき（sms-webhook が status = undelivered / failed に更新）に、
-- push-notify の event 'sms_failed' を送る。通知の種類は「SMS」（返信と同じ sms_reply。今の登録のままで届く）。
-- 本体は本番の trg_push_notify と同じで、sms_logs の分だけ変えた。

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
      v_event := 'sms_reply'; v_store := new.store_id; v_id := new.id;
    else
      -- 送ったSMSが失敗・届かなかった（同じSMSで2回知らせない）
      if new.status not in ('failed', 'undelivered') then return new; end if;
      if tg_op = 'UPDATE' and old.status in ('failed', 'undelivered') then return new; end if;
      v_event := 'sms_failed'; v_store := new.store_id; v_id := new.id;
    end if;
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
    when v_event = 'sms_failed' then 'sms_reply'
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

-- 今までは返信（INSERT）だけ。送信の結果があとから更新されたときも見る
create or replace trigger sms_logs_push_notify_status
  after update of status on public.sms_logs
  for each row execute function public.trg_push_notify();
