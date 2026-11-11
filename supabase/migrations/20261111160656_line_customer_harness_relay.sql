-- 既存Lハーネスの受信を維持する。転送先のURL（鍵を含み得る）はVaultから外へ出さない。
create or replace function public.set_line_customer_relay(p_store_id uuid,p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_endpoint !~ '^https://line-harness\.saito-crow\.workers\.dev/' then raise exception 'Unsupported relay'; end if;
  select id into v_id from vault.secrets where name='line_customer_relay:'||p_store_id::text;
  if v_id is null then perform vault.create_secret(p_endpoint,'line_customer_relay:'||p_store_id::text,'既存のLハーネス受信先');
  else perform vault.update_secret(v_id,p_endpoint); end if;
end $$;
revoke all on function public.set_line_customer_relay(uuid,text) from public,anon,authenticated;
grant execute on function public.set_line_customer_relay(uuid,text) to service_role;

create or replace function public.get_line_customer_channel(p_webhook_key text default null,p_store_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('storeId',s.store_id,'enabled',s.enabled,'autoReply',s.auto_reply,'waitMinutes',s.wait_minutes,
    'instructions',s.instructions,'channelId',v.decrypted_secret::jsonb->>'channel_id',
    'channelSecret',v.decrypted_secret::jsonb->>'channel_secret','forwardWebhook',r.decrypted_secret)
  from public.line_customer_settings s
  left join vault.decrypted_secrets v on v.name=private.line_customer_secret_name(s.store_id)
  left join vault.decrypted_secrets r on r.name='line_customer_relay:'||s.store_id::text
  where (p_webhook_key is not null and s.webhook_key=p_webhook_key) or (p_webhook_key is null and s.store_id=p_store_id)
  limit 1
$$;
revoke all on function public.get_line_customer_channel(text,uuid) from public,anon,authenticated;
grant execute on function public.get_line_customer_channel(text,uuid) to service_role;
