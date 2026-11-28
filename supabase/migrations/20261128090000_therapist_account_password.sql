-- セラピストの外部アカウント（O2・エステ魂の魂セラピスト）を自動で作るときの共通のパスワード。
-- 値は Vault の therapist_account_password にだけ入れる（リポジトリは公開なので、ここには書かない）。
-- 読めるのは service_role（Edge Function o2-control）だけ。
create or replace function public.get_therapist_account_password()
returns text
language sql
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'therapist_account_password' limit 1;
$$;
revoke all on function public.get_therapist_account_password() from public, anon, authenticated;
grant execute on function public.get_therapist_account_password() to service_role;
