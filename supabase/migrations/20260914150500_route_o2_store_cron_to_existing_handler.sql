-- Vercel's project limit permits twelve serverless entrypoints. Reuse the established
-- Estama reconciliation cron handler for the O2 store availability run instead of
-- creating another function endpoint. The O2 run remains token-gated and isolated.
create or replace function private.dispatch_o2_store_availability_post()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  if not exists (
    select 1
    from public.o2_store_availability_settings as settings
    join public.store_site_credentials as credentials
      on credentials.store_id = settings.store_id
     and credentials.site = 'o2'
    where settings.is_enabled
      and nullif(btrim(credentials.login_id), '') is not null
      and nullif(credentials.password, '') is not null
  ) then
    return null;
  end if;

  delete from private.o2_store_availability_run_tokens
  where expires_at < now() - interval '1 day';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.o2_store_availability_run_tokens (token_hash, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '15 minutes');

  select net.http_post(
    url := 'https://enka-salon.jp/api/cron/estama-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('o2_store_availability_token', v_token),
    timeout_milliseconds := 300000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function private.dispatch_o2_store_availability_post() from public, anon, authenticated;
grant execute on function private.dispatch_o2_store_availability_post() to service_role;
