-- エステ魂「スカウト求人」の自動化。Vercel（/api/cron/estama-appeal?action=estama-scout）を
-- 一回限りのトークンで呼ぶ。トークンの purpose は 'estama-scout:<store_id>'。

alter table public.estama_sync_tokens
  drop constraint if exists estama_sync_tokens_purpose_check;

alter table public.estama_sync_tokens
  add constraint estama_sync_tokens_purpose_check
  check (
    purpose in (
      'dispatcher',
      'worker',
      'profile-worker',
      'availability-refresh',
      'therapist-appeal'
    )
    or purpose like 'report:%'
    or purpose like 'notify:%'
    or purpose like 'continue:%'
    or purpose like 'estama-scout:%'
  );

-- トークンを使用済みにして、対象の店舗IDを返す（使えないトークンは null）
create or replace function public.claim_estama_scout_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purpose text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  update public.estama_sync_tokens
  set used_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and purpose like 'estama-scout:%'
    and used_at is null
    and expires_at > now()
  returning purpose into v_purpose;

  if v_purpose is null
     or substr(v_purpose, 14) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return substr(v_purpose, 14)::uuid;
end;
$$;

revoke all on function public.claim_estama_scout_token(text)
  from public, anon, authenticated;
grant execute on function public.claim_estama_scout_token(text)
  to service_role;
