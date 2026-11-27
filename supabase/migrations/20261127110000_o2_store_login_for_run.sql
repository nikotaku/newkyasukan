-- estama-scout（実行トークン）から O2 の店舗アカウントのログイン情報を受け取る（連絡先・SNS（正本）の O2 への反映・画面の確認用）
create or replace function public.get_o2_store_login_for_run(p_run_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;
  return (select jsonb_build_object('login_id', c.login_id, 'password', c.password)
          from public.store_site_credentials c where c.store_id = v_store and c.site = 'o2' limit 1);
end;
$$;
revoke all on function public.get_o2_store_login_for_run(text) from public, anon, authenticated;
grant execute on function public.get_o2_store_login_for_run(text) to anon, service_role;
