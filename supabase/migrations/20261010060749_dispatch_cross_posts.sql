-- HPニュース→エステ魂、セラピスト投稿→O2・魂セラピストの未処理分を
-- 管理画面のタブに依存せず、Supabase pg_cron から定期的に再開する。
-- Vercel worker には一回限りのトークンだけを渡し、service role は渡さない。

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
      'therapist-appeal',
      'cross-post-worker'
    )
    or purpose like 'report:%'
    or purpose like 'notify:%'
    or purpose like 'continue:%'
    or purpose like 'estama-scout:%'
  );

create or replace function public.claim_cross_post_worker_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select token.token_hash
  into v_token_hash
  from public.estama_sync_tokens as token
  where token.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and token.purpose = 'cross-post-worker'
    and token.used_at is null
    and token.expires_at > now()
  for update;

  if v_token_hash is null then
    return false;
  end if;

  -- 毎時40分の空き枠更新と同じBrowserbase contextを同時操作しない。
  if extract(minute from now()) between 27 and 42 then
    update public.estama_sync_tokens set used_at = now()
    where token_hash = v_token_hash;
    return false;
  end if;

  delete from private.estama_context_leases where expires_at <= now();

  if exists (
    select 1 from private.estama_context_leases
    where expires_at > now()
  ) then
    update public.estama_sync_tokens set used_at = now()
    where token_hash = v_token_hash;
    return false;
  end if;

  insert into private.estama_context_leases (
    store_id, owner_token, operation, acquired_at, expires_at
  )
  select distinct pending.store_id, v_token_hash, 'cross-post-worker', now(), now() + interval '6 minutes'
  from (
    select article.store_id
    from public.hp_articles as article
    join public.automation_connections as connection
      on connection.store_id = article.store_id
     and connection.provider = 'estama'
     and connection.status = 'ready'
     and connection.browserbase_context_id is not null
    where article.is_published = true
      and article.created_at >= timestamptz '2026-10-08 12:50:00+00'
      and article.estama_status in ('pending', 'failed')
      and article.estama_attempts < 3
      and coalesce(article.estama_error, '') not like '【要確認・再送停止】%'
    union
    select post.store_id
    from public.cast_posts as post
    where post.created_at >= now() - interval '30 days'
      and (
        (post.o2_status in ('pending', 'failed') and post.o2_attempts < 3
          and coalesce(post.o2_error, '') not like '【要確認・再送停止】%')
        or
        (post.esutama_status in ('pending', 'failed', 'skipped') and post.esutama_attempts < 3
          and coalesce(post.esutama_error, '') not like '【要確認・再送停止】%'
          and exists (
            select 1 from public.automation_connections as connection
            where connection.store_id = post.store_id
              and connection.provider = 'estama'
              and connection.status = 'ready'
              and connection.browserbase_context_id is not null
          ))
      )
  ) as pending
  on conflict (store_id) do nothing;

  if not found then
    update public.estama_sync_tokens set used_at = now()
    where token_hash = v_token_hash;
    return false;
  end if;

  update public.estama_sync_tokens
  set used_at = now()
  where token_hash = v_token_hash
    and purpose = 'cross-post-worker'
    and used_at is null
    and expires_at > now();

  if not found then
    delete from private.estama_context_leases
    where owner_token = v_token_hash and operation = 'cross-post-worker';
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.release_cross_post_worker_lease(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  delete from private.estama_context_leases
  where owner_token = v_token_hash and operation = 'cross-post-worker';
  return found;
end;
$$;

create or replace function private.dispatch_cross_posts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_token text;
  v_request_id bigint;
begin
  delete from private.estama_context_leases where expires_at <= now();

  if extract(minute from now()) between 27 and 42 then
    return null;
  end if;

  if exists (
    select 1 from private.estama_context_leases where expires_at > now()
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.hp_articles as article
    join public.automation_connections as connection
      on connection.store_id = article.store_id
     and connection.provider = 'estama'
     and connection.status = 'ready'
     and connection.browserbase_context_id is not null
    where article.is_published = true
      and article.created_at >= timestamptz '2026-10-08 12:50:00+00'
      and article.estama_status in ('pending', 'failed')
      and article.estama_attempts < 3
      and coalesce(article.estama_error, '') not like '【要確認・再送停止】%'
  ) and not exists (
    select 1
    from public.cast_posts as post
    where post.created_at >= now() - interval '30 days'
      and (
        (post.o2_status in ('pending', 'failed') and post.o2_attempts < 3
          and coalesce(post.o2_error, '') not like '【要確認・再送停止】%')
        or
        (post.esutama_status in ('pending', 'failed', 'skipped') and post.esutama_attempts < 3
          and coalesce(post.esutama_error, '') not like '【要確認・再送停止】%'
          and exists (
            select 1 from public.automation_connections as connection
            where connection.store_id = post.store_id
              and connection.provider = 'estama'
              and connection.status = 'ready'
              and connection.browserbase_context_id is not null
          ))
      )
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.estama_sync_tokens
    where purpose = 'cross-post-worker'
      and used_at is null
      and created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  delete from public.estama_sync_tokens
  where expires_at < now() - interval '1 day';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.estama_sync_tokens (token_hash, purpose, expires_at)
  values (
    encode(extensions.digest(v_raw_token, 'sha256'), 'hex'),
    'cross-post-worker',
    now() + interval '10 minutes'
  );

  select net.http_post(
    url := 'https://newkyasukan.vercel.app/api/automations/cross-post-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('token', v_raw_token),
    timeout_milliseconds := 300000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.claim_cross_post_worker_token(text)
  from public, anon, authenticated;
revoke all on function public.release_cross_post_worker_lease(text)
  from public, anon, authenticated;
revoke all on function private.dispatch_cross_posts()
  from public, anon, authenticated;

grant execute on function public.claim_cross_post_worker_token(text) to service_role;
grant execute on function public.release_cross_post_worker_lease(text) to service_role;
grant execute on function private.dispatch_cross_posts() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cross-posts-every-two-minutes') then
    perform cron.unschedule('cross-posts-every-two-minutes');
  end if;
  perform cron.schedule(
    'cross-posts-every-two-minutes',
    '*/2 * * * *',
    $cron$select private.dispatch_cross_posts();$cron$
  );
end;
$$;
