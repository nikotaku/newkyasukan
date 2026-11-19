-- スタッフ画面の「登録・反映 ◯%」の見落としを拾い直す毎時の見回り。
-- プロフィール同期のワーカーは待っている作業があるときだけ起動するので、HPの内容とエステ魂へ送った内容（ハッシュ）が
-- 違うのに作業が積まれていない人（紐付けが外れていた間の変更・手で紐付けた人など）は、ずっと「確認待ち」のままだった。
-- 毎時5分にワーカーを1回起こし、ワーカーが比べて必要な人の同期を積んでそのまま流す（enqueueOutdatedProfileSyncs）。
create or replace function private.dispatch_estama_profile_hash_check()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_raw_token text;
  v_request_id bigint;
begin
  -- 今すぐご案内・プロフィール同期がブラウザを使っている間は起こさない
  if exists (
    select 1
    from private.estama_context_leases as lease
    where lease.operation in ('hourly-availability-refresh', 'profile-worker')
      and lease.expires_at > now()
  ) then
    return null;
  end if;

  if exists (
    select 1
    from public.automation_jobs as job
    where job.provider = 'estama'
      and job.job_type = 'estama_register_cast'
      and job.status = 'running'
  ) then
    return null;
  end if;

  -- 毎分のディスパッチャーが起こしたばかりのワーカーがあれば任せる
  if exists (
    select 1
    from public.estama_sync_tokens as token
    where token.purpose = 'profile-worker'
      and token.used_at is null
      and token.created_at > now() - interval '15 minutes'
  ) then
    return null;
  end if;

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
$function$;

revoke all on function private.dispatch_estama_profile_hash_check() from public, anon, authenticated;

select cron.schedule(
  'estama-profile-hash-check-hourly',
  '5 * * * *',
  $$select private.dispatch_estama_profile_hash_check();$$
);
