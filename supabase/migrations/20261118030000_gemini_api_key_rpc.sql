-- HPのニュースの本文をAIで作るときの Google AI（Gemini）の鍵。鍵の値は Vault の gemini_api_key にだけ置く（リポジトリには書かない）。
-- Edge Function generate-cast-content が service_role で読む。
create or replace function public.get_gemini_api_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key' limit 1;
$$;

revoke all on function public.get_gemini_api_key() from public, anon, authenticated;
grant execute on function public.get_gemini_api_key() to service_role;
