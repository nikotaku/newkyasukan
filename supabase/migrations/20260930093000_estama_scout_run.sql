-- Vercelには管理鍵を置かない（既存のエスたま処理と同じ）。一回限りのトークンを
-- 短時間の実行トークン（run token）に換え、以後のDB操作はその実行トークンで守られたRPCだけで行う。

drop function if exists public.claim_estama_scout_token(text);

create table if not exists private.estama_scout_runs (
  token_hash text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
revoke all on table private.estama_scout_runs from public, anon, authenticated;

-- 実行トークンが有効なら店舗IDを返す
create or replace function private.estama_scout_run_store(p_run_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select run.store_id
  from private.estama_scout_runs as run
  where coalesce(p_run_token, '') ~ '^[0-9a-f]{64}$'
    and run.token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex')
    and run.expires_at > now();
$$;
revoke all on function private.estama_scout_run_store(text) from public, anon, authenticated;

-- 一回限りのトークンを使って実行を始める。エスたまの同じログインを使う処理と重ならないようロックも取る
create or replace function public.claim_estama_scout_run(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purpose text;
  v_store_id uuid;
  v_connection public.automation_connections;
  v_run_token text;
  v_run_hash text;
  v_rows integer;
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
  v_store_id := substr(v_purpose, 14)::uuid;

  select * into v_connection
  from public.automation_connections
  where store_id = v_store_id and provider = 'estama';
  if v_connection.id is null
     or v_connection.status <> 'ready'
     or v_connection.browserbase_context_id is null then
    return jsonb_build_object('storeId', v_store_id, 'unavailable', true,
      'reason', 'エステ魂の自動化がログイン済みではありません');
  end if;

  delete from private.estama_scout_runs where expires_at <= now();
  delete from private.estama_context_leases where expires_at <= now();

  v_run_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_run_hash := encode(extensions.digest(v_run_token, 'sha256'), 'hex');

  -- 実行中のエスたまジョブ（プロフィール・シフト同期など）があれば今回は見送る
  if exists (
    select 1 from public.automation_jobs as job
    where job.store_id = v_store_id
      and job.provider = 'estama'
      and job.status = 'running'
      and coalesce(job.started_at, job.updated_at, job.created_at) > now() - interval '15 minutes'
  ) then
    return jsonb_build_object('storeId', v_store_id, 'deferred', true,
      'reason', '別のエスたま処理が実行中です');
  end if;

  insert into private.estama_context_leases as lease (store_id, owner_token, operation, acquired_at, expires_at)
  values (v_store_id, v_run_hash, 'estama-scout', now(), now() + interval '6 minutes')
  on conflict (store_id) do update
  set owner_token = excluded.owner_token,
      operation = excluded.operation,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
  where lease.expires_at <= now();
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('storeId', v_store_id, 'deferred', true,
      'reason', '別のエスたま処理が実行中です');
  end if;

  insert into private.estama_scout_runs (token_hash, store_id, expires_at)
  values (v_run_hash, v_store_id, now() + interval '10 minutes');

  return jsonb_build_object(
    'runToken', v_run_token,
    'storeId', v_store_id,
    'connection', jsonb_build_object(
      'id', v_connection.id,
      'store_id', v_connection.store_id,
      'status', v_connection.status,
      'browserbase_context_id', v_connection.browserbase_context_id,
      'setup_session_id', v_connection.setup_session_id,
      'shop_id', v_connection.shop_id,
      'configuration', '{}'::jsonb
    )
  );
end;
$$;
revoke all on function public.claim_estama_scout_run(text) from public;
grant execute on function public.claim_estama_scout_run(text) to anon, authenticated, service_role;

-- 実行を終える（ロックを外す）
create or replace function public.release_estama_scout_run(p_run_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_store_id uuid;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  v_hash := encode(extensions.digest(p_run_token, 'sha256'), 'hex');
  delete from private.estama_scout_runs where token_hash = v_hash returning store_id into v_store_id;
  if v_store_id is null then
    return false;
  end if;
  delete from private.estama_context_leases where store_id = v_store_id and owner_token = v_hash;
  return true;
end;
$$;
revoke all on function public.release_estama_scout_run(text) from public;
grant execute on function public.release_estama_scout_run(text) to anon, authenticated, service_role;
