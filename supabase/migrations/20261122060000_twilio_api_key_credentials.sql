-- Twilio の主認証トークンを使わず、失効・権限分離ができる API キーで認証する。
-- 値そのものは Vercel の本番環境変数からビルド時に Vault へ同期し、リポジトリには置かない。

create or replace function public.set_twilio_api_credentials(
  p_account_sid text,
  p_api_key_sid text,
  p_api_key_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if nullif(trim(p_account_sid), '') is null
    or nullif(trim(p_api_key_sid), '') is null
    or nullif(trim(p_api_key_secret), '') is null then
    raise exception 'Twilio API credentials must not be empty';
  end if;

  select id into v_id from vault.secrets where name = 'twilio_account_sid' limit 1;
  if v_id is null then
    perform vault.create_secret(p_account_sid, 'twilio_account_sid', 'Twilio Account SID (SMS)');
  else
    perform vault.update_secret(v_id, p_account_sid, 'twilio_account_sid', 'Twilio Account SID (SMS)');
  end if;

  select id into v_id from vault.secrets where name = 'twilio_api_key_sid' limit 1;
  if v_id is null then
    perform vault.create_secret(p_api_key_sid, 'twilio_api_key_sid', 'Twilio restricted API Key SID (SMS)');
  else
    perform vault.update_secret(v_id, p_api_key_sid, 'twilio_api_key_sid', 'Twilio restricted API Key SID (SMS)');
  end if;

  select id into v_id from vault.secrets where name = 'twilio_api_key_secret' limit 1;
  if v_id is null then
    perform vault.create_secret(p_api_key_secret, 'twilio_api_key_secret', 'Twilio restricted API Key secret (SMS)');
  else
    perform vault.update_secret(v_id, p_api_key_secret, 'twilio_api_key_secret', 'Twilio restricted API Key secret (SMS)');
  end if;
end;
$$;

revoke all on function public.set_twilio_api_credentials(text, text, text) from public, anon, authenticated;
grant execute on function public.set_twilio_api_credentials(text, text, text) to service_role;

drop function if exists public.get_twilio_credentials();

create function public.get_twilio_credentials()
returns table(account_sid text, auth_token text, api_key_sid text, api_key_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_account_sid' limit 1),
    -- 既存Edge Functionを止めずに順次切り替えるため、旧列は移行期間中だけ残す。
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_auth_token' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_api_key_sid' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_api_key_secret' limit 1);
$$;

revoke all on function public.get_twilio_credentials() from public, anon, authenticated;
grant execute on function public.get_twilio_credentials() to service_role;
