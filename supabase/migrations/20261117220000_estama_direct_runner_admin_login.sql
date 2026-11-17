-- Browserbase をやめる準備（段階0）：GitHub Actions の直接実行で、エステ魂の店舗管理画面に
-- 毎回ログインできるかを確かめる。ログイン情報は Vault（estama_admin_login:<store_id>）から
-- Vercel の直接実行の受け口（service_role）だけが読む。ログ・結果には出さない。
create or replace function public.get_estama_admin_login_for_runner(p_store_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $$ select private.estama_admin_login(p_store_id); $$;

revoke all on function public.get_estama_admin_login_for_runner(uuid) from public, anon, authenticated;
grant execute on function public.get_estama_admin_login_for_runner(uuid) to service_role;
