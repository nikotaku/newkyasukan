-- Twilio（SMS）の残高確認と、残高が少ないときのLINE通知（Edge Function sms-billing）。
-- Twilioの認証情報は Vault の twilio_account_sid / twilio_auth_token に置く（値はこのファイルに書かない）。

create or replace function public.get_twilio_credentials()
returns table(account_sid text, auth_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_account_sid' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_auth_token' limit 1);
$$;

revoke all on function public.get_twilio_credentials() from public, anon, authenticated;
grant execute on function public.get_twilio_credentials() to service_role;

create or replace function public.verify_sms_billing_cron_secret(candidate text)
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
      where name = 'sms_billing_cron_secret'
        and decrypted_secret = candidate
    );
$$;

revoke all on function public.verify_sms_billing_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_sms_billing_cron_secret(text) to service_role;

-- 残高の通知履歴（1日1回まで知らせるための記録）
create table if not exists public.sms_balance_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  balance numeric not null,
  effective_balance numeric not null,
  currency text not null default 'JPY',
  delivered boolean not null default false,
  channel text
);

alter table public.sms_balance_alerts enable row level security;
revoke all on table public.sms_balance_alerts from anon, authenticated;
grant all on table public.sms_balance_alerts to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sms_billing_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sms_billing_cron_secret',
      'Authenticates the scheduled sms-billing balance check'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'sms_billing_publishable_key') then
    perform vault.create_secret(
      'sb_publishable_T0a9mtOIbupU5n_VAe9caw_xlnbbWfB',
      'sms_billing_publishable_key',
      'Publishable key for the scheduled sms-billing balance check'
    );
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sms-balance-check') then
    perform cron.unschedule('sms-balance-check');
  end if;

  perform cron.schedule(
    'sms-balance-check',
    '23 * * * *',
    $job$
      select net.http_post(
        url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/sms-billing',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'sms_billing_publishable_key'
          ),
          'x-sms-billing-cron-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'sms_billing_cron_secret'
          )
        ),
        body := '{"action":"check-alert"}'::jsonb,
        timeout_milliseconds := 30000
      ) as request_id;
    $job$
  );
end;
$$;
