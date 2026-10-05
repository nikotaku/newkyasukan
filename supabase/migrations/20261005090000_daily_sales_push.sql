-- セラピストがマイページから精算（その日の売上、daily_sales_records）を送ったら、管理画面アプリへスマホ通知する。
-- 送り直し（金額・本数・メモが変わった、差し戻し後にもう一度送った）でも知らせる。通知の種類は daily_sales。

create or replace function public.trg_push_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_event text;
  v_store uuid;
  v_resubmitted boolean := false;
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
  elsif tg_table_name = 'daily_sales_records' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'daily_sales';
    v_store := new.store_id;
    v_resubmitted := tg_op = 'UPDATE';
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
    body := jsonb_build_object('event', v_event, 'id', new.id, 'resubmitted', v_resubmitted)
  );
  return new;
exception when others then
  raise warning 'push notify skipped: %', sqlerrm;
  return new;
end;
$function$;

create or replace trigger daily_sales_records_push_notify
  after insert on public.daily_sales_records
  for each row execute function public.trg_push_notify();

create or replace trigger daily_sales_records_push_notify_resubmit
  after update on public.daily_sales_records
  for each row
  when (
    new.status = 'pending'
    and (
      old.status is distinct from new.status
      or old.total_amount is distinct from new.total_amount
      or old.cash_amount is distinct from new.cash_amount
      or old.card_amount is distinct from new.card_amount
      or old.paypay_amount is distinct from new.paypay_amount
      or old.customer_count is distinct from new.customer_count
      or old.manual_adjustment is distinct from new.manual_adjustment
      or old.notes is distinct from new.notes
    )
  )
  execute function public.trg_push_notify();

-- 今スマホ通知を受け取っている端末は、精算の通知も受け取るようにする（設定画面で外せる）
update public.push_subscriptions
set topics = array_append(topics, 'daily_sales')
where not ('daily_sales' = any (topics));
