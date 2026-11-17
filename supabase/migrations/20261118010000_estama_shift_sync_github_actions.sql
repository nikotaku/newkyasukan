-- Browserbase をやめる（段階1）：エステ魂の出勤同期を GitHub Actions の直接実行でも動かせるようにする。
-- automation_runner_settings.shift_enabled をオンにした店舗だけ、新しく積まれる estama_sync_shift を
-- runner = 'github_actions' にする（オフの間は今まで通り Browserbase）。
-- ランナーは画面の操作だけを行い、DBの読み書きは Vercel の受け口（server/estama-direct-runner-handler.ts）が行う。

alter table public.automation_runner_settings
  add column if not exists shift_enabled boolean not null default false;

-- 新しく積まれた出勤同期の行き先を決める
create or replace function private.route_estama_shift_job()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.provider = 'estama' and new.job_type = 'estama_sync_shift' and exists (
    select 1 from public.automation_runner_settings s where s.store_id = new.store_id and s.shift_enabled
  ) then
    new.runner := 'github_actions';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_route_estama_shift_job on public.automation_jobs;
create trigger trg_route_estama_shift_job
  before insert on public.automation_jobs
  for each row execute function private.route_estama_shift_job();

-- 直接実行が受け取る作業：写メ日記（diary_enabled）と出勤同期（shift_enabled）
create or replace function public.claim_estama_direct_job(p_store_id uuid, p_run_id text)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare j public.automation_jobs; s public.automation_runner_settings;
begin
 select * into s from public.automation_runner_settings where store_id=p_store_id and (diary_enabled or shift_enabled) for update;
 if not found then return null; end if;
 if exists(select 1 from public.automation_jobs where runner='github_actions' and store_id=p_store_id and status='running') then return null; end if;
 if not exists(select 1 from public.automation_runner_runs where run_id=p_run_id and store_id=p_store_id and status='running' and mode='work') then raise exception 'run_not_active'; end if;
 select * into j from public.automation_jobs where store_id=p_store_id and runner='github_actions'
  and ((job_type='estama_post_diary' and s.diary_enabled) or (job_type='estama_sync_shift' and s.shift_enabled))
  and status='queued' and available_at<=now() and attempts<max_attempts
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.automation_jobs set status='running',attempts=attempts+1,started_at=now(),heartbeat_at=now(),
  runner_run_id=p_run_id,runner_lease=gen_random_uuid(),error_message=null,finished_at=null
  where id=j.id returning * into j;
 if j.job_type='estama_post_diary' then
  update public.cast_posts set esutama_attempts=coalesce(esutama_attempts,0)+1,last_attempt_at=now() where id=(j.payload->>'post_id')::uuid;
 end if;
 return to_jsonb(j);
end $$;

-- 終わった作業を記録する。写メ日記の確認は今まで通り。出勤同期の失敗は Browserbase と同じく間をあけて再試行する
create or replace function public.finish_estama_direct_job(p_job_id uuid, p_lease uuid, p_run_id text, p_status text, p_result jsonb, p_error text)
returns boolean
language plpgsql
set search_path to ''
as $$
declare j public.automation_jobs; post_id uuid;
begin
 select * into j from public.automation_jobs where id=p_job_id and runner='github_actions' and runner_lease=p_lease
  and runner_run_id=p_run_id and status='running' for update;
 if not found then return false; end if;
 if p_status not in ('completed','failed','review_required') then raise exception 'invalid_status'; end if;

 if j.job_type='estama_sync_shift' then
  if p_status='failed' and j.attempts<j.max_attempts then
   update public.automation_jobs set status='queued',result=coalesce(p_result,'{}'),error_message=p_error,
    available_at=now()+make_interval(mins=>least(60,power(2,greatest(0,j.attempts-1))::int)),
    finished_at=null,heartbeat_at=now(),runner_lease=null,runner_run_id=null,
    duration_ms=(extract(epoch from (now()-j.started_at))*1000)::bigint where id=j.id;
  else
   update public.automation_jobs set status=p_status,result=coalesce(p_result,'{}'),error_message=p_error,finished_at=now(),heartbeat_at=now(),
    duration_ms=(extract(epoch from (now()-j.started_at))*1000)::bigint where id=j.id;
  end if;
  update public.automation_runner_runs set processed=processed+1,heartbeat_at=now() where run_id=p_run_id;
  return true;
 end if;

 if p_status='completed' and (coalesce(p_result->>'posted','')<>'true' or coalesce(p_result->>'url','') !~ '^https://estama.jp/' or coalesce(p_result->>'uploadedPhotos','')<>'1') then raise exception 'publication_not_verified'; end if;
 if p_status='failed' and j.submission_started_at is not null then p_status:='review_required'; end if;
 post_id:=(j.payload->>'post_id')::uuid;
 update public.automation_jobs set status=p_status,result=p_result,error_message=p_error,finished_at=now(),heartbeat_at=now(),
  duration_ms=(extract(epoch from (now()-j.started_at))*1000)::bigint where id=j.id;
 update public.cast_posts set esutama_status=case when p_status='completed' then 'posted' else 'failed' end,
  esutama_error=case when p_status='review_required' then '【要確認・再送停止】掲載を確認するまで再送できません' else p_error end,
  posted_at=case when p_status='completed' then now() else posted_at end where id=post_id;
 if p_status='completed' then
  update public.cast_diaries set external_url=p_result->>'url' where source_post_id=post_id;
 end if;
 update public.cast_posts set status=case when o2_status in ('posted','skipped') and esutama_status='posted' then 'posted' when o2_status='failed' or esutama_status='failed' then 'failed' else 'pending' end where id=post_id;
 update public.automation_runner_runs set processed=processed+1,heartbeat_at=now() where run_id=p_run_id;
 return true;
end $$;

-- 起動役：写メ日記か出勤同期が待っていれば GitHub Actions を起動する。出勤同期は早く反映したいので間隔を3分にする
create or replace function private.dispatch_estama_direct_runner()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare s public.automation_runner_settings; token text; request_id bigint; response_status integer;
begin
 for s in select * from public.automation_runner_settings where diary_enabled or shift_enabled for update skip locked loop
  if s.dispatch_request_id is not null then
   select status_code into response_status from net._http_response where id=s.dispatch_request_id;
   if response_status is not null and response_status<>204 then
    update public.automation_runner_settings set last_dispatch_error='GitHub Actions起動失敗 HTTP '||response_status where store_id=s.store_id;
   end if;
  end if;
  if not exists(select 1 from public.automation_jobs where store_id=s.store_id and runner='github_actions' and status='queued' and available_at<=now()
   and ((job_type='estama_post_diary' and s.diary_enabled) or (job_type='estama_sync_shift' and s.shift_enabled))) then continue; end if;
  if exists(select 1 from public.automation_runner_runs where store_id=s.store_id and status='running') then continue; end if;
  if s.dispatch_requested_at>now()-interval '3 minutes' then continue; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='estama_github_actions_dispatch_token';
  if coalesce(token,'')='' then
   update public.automation_runner_settings set last_dispatch_error='GitHub Actions起動用の認証設定が未完了です' where store_id=s.store_id;
   continue;
  end if;
  select net.http_post(url:='https://api.github.com/repos/nikotaku/newkyasukan/actions/workflows/estama-direct-runner.yml/dispatches',
   headers:=jsonb_build_object('Authorization','Bearer '||token,'Accept','application/vnd.github+json','Content-Type','application/json','X-GitHub-Api-Version','2022-11-28'),
   body:='{"ref":"main","inputs":{"mode":"work"}}'::jsonb,timeout_milliseconds:=10000) into request_id;
  update public.automation_runner_settings set dispatch_requested_at=now(),dispatch_request_id=request_id,last_dispatch_error=null where store_id=s.store_id;
 end loop;
end $$;
