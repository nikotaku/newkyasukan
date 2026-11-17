-- 前日リマインドSMSの「明日」を営業日で見る（11/18 0:00 の予約＝11/17 24:00 は 11/16 の夕方に送る）。
-- 以前は暦日で見ていたため、深夜の予約は当日に「明日…」と届いていた。

select cron.schedule(
  'enka-reservation-sms-reminders',
  '*/15 9-13 * * *',
  $job$
    select net.http_post(
      url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/send-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
        'x-send-sms-secret', secret.decrypted_secret
      ),
      body := jsonb_build_object('action', 'reservation_reminder', 'reminder_reservation_id', r.id),
      timeout_milliseconds := 30000
    )
    from public.reservations r
    cross join vault.decrypted_secrets secret
    where secret.name = 'send_sms_internal_secret'
      and r.store_id = '404499ab-5350-490f-9608-5814faffda6f'
      and r.status = 'confirmed'
      -- 営業日で「明日」（6時前の予約は前日の24時台・25時台なので、もう1日前に送る）
      and r.reservation_date - (case when r.start_time < time '06:00' then 1 else 0 end)
          = (now() at time zone 'Asia/Tokyo')::date + 1
      and r.start_time is not null
      and r.customer_phone ~ '[0-9]'
      and not exists (
        select 1 from public.sms_logs l
        where l.reservation_reminder_key = concat(r.id, '/', r.reservation_date, '/', r.start_time)
      );
  $job$
);
