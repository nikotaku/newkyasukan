-- シフト同期（estama_sync_shift）の「待ち」を、毎分のバックグラウンド処理でも流す。
-- 2026-10-22：エステ魂のログインが切れている間（10/21 夜）にシフトを直した分が、
-- 再ログイン後に queued へ戻ったまま、次の23時の一括同期まで誰も処理しなかった。
-- プロフィール同期と同じワーカー（/api/automations/estama-profile-worker）が、プロフィールの次にシフトも処理する。
create or replace function private.dispatch_estama_profile_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_token text;
  v_request_id bigint;
begin
  delete from private.estama_context_leases
  where expires_at <= now();

  delete from private.estama_context_leases as lease
  where lease.operation = 'profile-dispatch-reservation'
    and lease.acquired_at < now() - interval '1 minute'
    and not exists (
      select 1
      from public.automation_jobs as job
      where job.store_id = lease.store_id
        and job.provider = 'estama'
        and job.job_type = 'estama_register_cast'
        and job.status = 'running'
        and coalesce(job.started_at, job.updated_at, job.created_at)
          > now() - interval '7 minutes'
    );

  if exists (
    select 1
    from private.estama_context_leases as lease
    where lease.operation in ('hourly-availability-refresh', 'profile-worker')
      and lease.expires_at > now()
  ) then
    return null;
  end if;

  if extract(minute from now()) between 35 and 42 then
    return null;
  end if;

  update public.automation_jobs
  set status = 'queued',
      available_at = now(),
      error_message = '前回のプロフィール同期が中断されたため自動再開しました',
      started_at = null
  where provider = 'estama'
    and job_type = 'estama_register_cast'
    and status = 'running'
    and started_at < now() - interval '7 minutes';

  -- 動いている作業があれば待つ（23時の一括シフト同期の最中も同じブラウザを使うので重ねない）
  if exists (
    select 1
    from public.automation_jobs as job
    where job.provider = 'estama'
      and (
        job.job_type = 'estama_register_cast'
        or (
          job.job_type = 'estama_sync_shift'
          and coalesce(job.started_at, job.updated_at) > now() - interval '30 minutes'
        )
      )
      and job.status = 'running'
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.automation_jobs as job
    where job.provider = 'estama'
      and job.job_type in ('estama_register_cast', 'estama_sync_shift')
      and job.status = 'queued'
      and job.available_at <= now()
  ) then
    return null;
  end if;

  if exists (
    select 1
    from public.estama_sync_tokens as token
    where token.purpose = 'profile-worker'
      and token.used_at is null
      and token.created_at > now() - interval '15 minutes'
  ) then
    return null;
  end if;

  delete from public.estama_sync_tokens
  where expires_at < now() - interval '1 day';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.estama_sync_tokens (token_hash, purpose, expires_at)
  values (
    encode(extensions.digest(v_raw_token, 'sha256'), 'hex'),
    'profile-worker',
    now() + interval '10 minutes'
  );

  select net.http_post(
    url := 'https://newkyasukan.vercel.app/api/automations/estama-profile-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('token', v_raw_token),
    timeout_milliseconds := 300000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.dispatch_estama_profile_sync() from public, anon, authenticated;
