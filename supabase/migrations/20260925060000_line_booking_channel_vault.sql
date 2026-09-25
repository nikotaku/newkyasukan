-- 予約通知専用LINE公式アカウントのChannel ID / Channel secretをVaultから読む。
-- 値そのものはVault（line_booking_channel_id / line_booking_channel_secret）に入れ、
-- マイグレーションには含めない。Edge Functionはこれを使って15分有効のトークンを発行する。
create or replace function public.get_line_booking_channel()
returns table (channel_id text, channel_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'line_booking_channel_id' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'line_booking_channel_secret' limit 1);
$$;

revoke all on function public.get_line_booking_channel() from public, anon, authenticated;
grant execute on function public.get_line_booking_channel() to service_role;
