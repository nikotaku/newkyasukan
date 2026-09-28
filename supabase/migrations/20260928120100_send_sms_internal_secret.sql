-- send-sms を公開鍵（anon / publishable）だけでは呼べないようにする。
-- 予約確定時の自動SMS（トリガー trg_send_reservation_sms）は Vault の内部シークレットを付けて呼ぶ。
-- 管理画面からはログイン中のスタッフのJWT、他のEdge Functionからは service_role で呼ぶ。

create or replace function public.verify_send_sms_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate is not null
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'send_sms_internal_secret'
        and decrypted_secret = candidate
    );
$$;

revoke all on function public.verify_send_sms_secret(text) from public, anon, authenticated;
grant execute on function public.verify_send_sms_secret(text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'send_sms_internal_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'send_sms_internal_secret',
      'Authenticates the reservation-confirmed trigger call to send-sms'
    );
  end if;
end;
$$;

create or replace function public.trg_send_reservation_sms()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_enabled boolean;
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;
  if coalesce(new.customer_phone, '') = '' then return new; end if;
  if new.sms_notification_status is not null then return new; end if;
  if new.reservation_date < (now() at time zone 'Asia/Tokyo')::date then return new; end if;

  select coalesce((settings->>'sms_auto_confirm')::boolean, true) into v_enabled
    from stores where id = new.store_id;
  if v_enabled is false then return new; end if;

  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/send-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-send-sms-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_sms_internal_secret')
    ),
    body := jsonb_build_object('reservation_id', new.id)
  );
  return new;
end;
$function$;
