-- 制限付きAPIキーに番号一覧の閲覧権限を与えず、送信元番号をVaultから使う。

create or replace function public.set_twilio_sms_from(p_sms_from text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if nullif(trim(p_sms_from), '') is null then
    raise exception 'Twilio SMS sender must not be empty';
  end if;
  select id into v_id from vault.secrets where name = 'twilio_sms_from' limit 1;
  if v_id is null then
    perform vault.create_secret(p_sms_from, 'twilio_sms_from', 'Twilio SMS sender number (E.164)');
  else
    perform vault.update_secret(v_id, p_sms_from, 'twilio_sms_from', 'Twilio SMS sender number (E.164)');
  end if;
end;
$$;

revoke all on function public.set_twilio_sms_from(text) from public, anon, authenticated;
grant execute on function public.set_twilio_sms_from(text) to service_role;

drop function if exists public.get_twilio_credentials();

create function public.get_twilio_credentials()
returns table(account_sid text, auth_token text, api_key_sid text, api_key_secret text, sms_from text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_account_sid' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_auth_token' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_api_key_sid' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_api_key_secret' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_sms_from' limit 1);
$$;

revoke all on function public.get_twilio_credentials() from public, anon, authenticated;
grant execute on function public.get_twilio_credentials() to service_role;
