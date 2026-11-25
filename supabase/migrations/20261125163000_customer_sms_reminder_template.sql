insert into public.sms_auto_templates (store_id, name, trigger, timing_minutes, message, is_active)
select id, '前日リマインド', 'reservation_reminder', -1440,
  '艶華です。明日{date_long} {time}からご予約を承っています。変更の際はお早めにご連絡ください。', true
from public.stores s where custom_domain = 'enka-salon.jp'
and not exists (select 1 from public.sms_auto_templates t where t.store_id = s.id and t.trigger = 'reservation_reminder');
