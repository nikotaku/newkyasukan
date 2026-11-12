-- Additive rollout: no existing jobs are routed, revived, or retried.
begin;
alter table public.automation_jobs drop constraint automation_jobs_status_check;
alter table public.automation_jobs add constraint automation_jobs_status_check check
 (status in ('queued','running','waiting_for_login','completed','failed','review_required','cancelled'));
alter table public.automation_jobs
 add column runner text not null default 'browserbase' check (runner in ('browserbase','github_actions')),
 add column heartbeat_at timestamptz,
 add column runner_run_id text,
 add column runner_lease uuid,
 add column submission_started_at timestamptz,
 add column duration_ms bigint;
create index automation_jobs_direct_queue on public.automation_jobs(available_at,created_at)
 where runner='github_actions' and status='queued';

create table public.automation_runner_settings (
 store_id uuid primary key references public.stores(id),
 diary_enabled boolean not null default false,
 audit_enabled boolean not null default true,
 monthly_limit_minutes integer not null default 2000 check (monthly_limit_minutes between 20 and 10000),
 dispatch_requested_at timestamptz,
 dispatch_request_id bigint,
 last_dispatch_error text,
 last_audit_at timestamptz,
 last_audit_result jsonb,
 updated_at timestamptz not null default now()
);
create table public.automation_runner_runs (
 run_id text primary key,
 store_id uuid not null references public.stores(id),
 mode text not null check (mode in ('audit','work')),
 status text not null default 'running' check(status in ('running','completed','failed','review_required')),
 started_at timestamptz not null default now(),
 heartbeat_at timestamptz not null default now(),
 finished_at timestamptz,
 duration_ms bigint,
 processed integer not null default 0,
 result jsonb not null default '{}'
);
alter table public.automation_runner_settings enable row level security;
alter table public.automation_runner_runs enable row level security;
revoke all on public.automation_runner_settings, public.automation_runner_runs from public,anon,authenticated;
grant all on public.automation_runner_settings, public.automation_runner_runs to service_role;
insert into public.automation_runner_settings(store_id)
select store_id from public.automation_connections where provider='estama' on conflict do nothing;

-- The caller is the existing authenticated post-to-sites service. Atomic post lock.
create function public.enqueue_estama_direct_diary(p_post_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p public.cast_posts; j uuid;
begin
 select * into p from public.cast_posts where id=p_post_id for update;
 if not found then raise exception 'post_not_found'; end if;
 if not exists(select 1 from public.automation_runner_settings where store_id=p.store_id and diary_enabled) then
  raise exception 'direct_runner_disabled'; end if;
 if p.esutama_status='posted' or coalesce(p.esutama_error,'') like '【要確認・再送停止】%' then
  raise exception 'publication_must_be_reviewed'; end if;
 select id into j from public.automation_jobs where store_id=p.store_id and job_type='estama_post_diary'
 and payload->>'post_id'=p.id::text and status in ('queued','running','waiting_for_login','review_required')
 order by created_at desc limit 1;
 if j is not null then return j; end if;
 if p.esutama_status='posting' then raise exception 'post_already_locked'; end if;
 insert into public.automation_jobs(store_id,provider,job_type,cast_id,dedupe_key,payload,runner,max_attempts)
 values(p.store_id,'estama','estama_post_diary',p.cast_id,'direct:diary:'||p.id||':'||gen_random_uuid(),
 jsonb_build_object('post_id',p.id,'source','direct_runner'),'github_actions',1) returning id into j;
 update public.cast_posts set esutama_status='posting',esutama_error=null where id=p.id;
 return j;
end $$;

create function public.claim_estama_direct_job(p_store_id uuid,p_run_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.automation_jobs;
begin
 perform 1 from public.automation_runner_settings where store_id=p_store_id and diary_enabled for update;
 if not found then return null; end if;
 if exists(select 1 from public.automation_jobs where runner='github_actions' and store_id=p_store_id and status='running') then return null; end if;
 if not exists(select 1 from public.automation_runner_runs where run_id=p_run_id and store_id=p_store_id and status='running' and mode='work') then raise exception 'run_not_active'; end if;
 select * into j from public.automation_jobs where store_id=p_store_id and runner='github_actions'
 and job_type='estama_post_diary' and status='queued' and available_at<=now() and attempts<max_attempts
 order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.automation_jobs set status='running',attempts=attempts+1,started_at=now(),heartbeat_at=now(),
 runner_run_id=p_run_id,runner_lease=gen_random_uuid(),error_message=null,finished_at=null
 where id=j.id returning * into j;
 update public.cast_posts set esutama_attempts=coalesce(esutama_attempts,0)+1,last_attempt_at=now() where id=(j.payload->>'post_id')::uuid;
 return to_jsonb(j);
end $$;

create function public.finish_estama_direct_job(p_job_id uuid,p_lease uuid,p_run_id text,p_status text,p_result jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.automation_jobs; post_id uuid;
begin
 select * into j from public.automation_jobs where id=p_job_id and runner='github_actions' and runner_lease=p_lease
 and runner_run_id=p_run_id and status='running' for update;
 if not found then return false; end if;
 if p_status not in ('completed','failed','review_required') then raise exception 'invalid_status'; end if;
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
 update public.cast_posts set status=case when o2_status='posted' and esutama_status='posted' then 'posted' when o2_status in ('failed','skipped') or esutama_status in ('failed','skipped') then 'failed' else 'pending' end where id=post_id;
 update public.automation_runner_runs set processed=processed+1,heartbeat_at=now() where run_id=p_run_id;
 return true;
end $$;

-- Scoped administrative action; uncertain publication cannot be retried here.
create function public.manage_estama_direct_job(p_store_id uuid,p_job_id uuid,p_action text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j public.automation_jobs;
begin
 select * into j from public.automation_jobs where id=p_job_id and store_id=p_store_id and runner='github_actions' for update;
 if not found then return false; end if;
 if p_action='cancel' and j.status in ('queued','failed') and j.submission_started_at is null then
  update public.automation_jobs set status='cancelled',finished_at=now(),error_message='管理者が取り消しました' where id=j.id;
  update public.cast_posts set esutama_status='failed',esutama_error='管理者が取り消しました' where id=(j.payload->>'post_id')::uuid and esutama_status='posting';
  return true;
 elsif p_action='retry' and j.status='failed' and j.submission_started_at is null then
  update public.automation_jobs set status='queued',attempts=0,runner_lease=null,runner_run_id=null,
   available_at=now(),started_at=null,finished_at=null,error_message=null where id=j.id;
  update public.cast_posts set esutama_status='posting',esutama_error=null where id=(j.payload->>'post_id')::uuid and esutama_status<>'posted';
  return true;
 end if;
 return false;
end $$;

create function private.watch_estama_direct_runner() returns void
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs;
begin
 for j in select * from public.automation_jobs where runner='github_actions' and status='running'
 and (heartbeat_at<now()-interval '3 minutes' or started_at<now()-interval '15 minutes') for update skip locked loop
  perform public.finish_estama_direct_job(j.id,j.runner_lease,j.runner_run_id,
   case when j.submission_started_at is null then 'failed' else 'review_required' end,'{}',
   case when j.submission_started_at is null then '実行環境が停止しました（送信前）' else '【要確認・再送停止】実行環境が停止しました（送信後）' end);
 end loop;
 update public.automation_runner_runs set status='review_required',finished_at=now(),
 duration_ms=(extract(epoch from(now()-started_at))*1000)::bigint
 where status='running' and (heartbeat_at<now()-interval '4 minutes' or started_at<now()-interval '20 minutes');
 update public.automation_runner_settings s set last_dispatch_error='GitHub Actionsの開始を確認できません。待機ジョブは保持されています'
 where dispatch_requested_at<now()-interval '10 minutes' and exists(select 1 from public.automation_jobs j where j.store_id=s.store_id and j.runner='github_actions' and j.status='queued')
 and not exists(select 1 from public.automation_runner_runs r where r.store_id=s.store_id and r.started_at>s.dispatch_requested_at);
end $$;

-- Browser work is dispatched only for pending jobs. No minute-by-minute Actions polling.
-- The repository-scoped Actions:write token is provisioned separately in Vault.
create function private.dispatch_estama_direct_runner() returns void
language plpgsql security definer set search_path='' as $$
declare s public.automation_runner_settings; token text; used_minutes numeric; request_id bigint; response_status integer;
begin
 for s in select * from public.automation_runner_settings where diary_enabled for update skip locked loop
  if s.dispatch_request_id is not null then
   select status_code into response_status from net._http_response where id=s.dispatch_request_id;
   if response_status is not null and response_status<>204 then
    update public.automation_runner_settings set last_dispatch_error='GitHub Actions起動失敗 HTTP '||response_status where store_id=s.store_id;
   end if;
  end if;
  if not exists(select 1 from public.automation_jobs where store_id=s.store_id and runner='github_actions' and status='queued' and available_at<=now()) then continue; end if;
  if exists(select 1 from public.automation_runner_runs where store_id=s.store_id and status='running') then continue; end if;
  if s.dispatch_requested_at>now()-interval '10 minutes' then continue; end if;
  select coalesce(sum(ceil(coalesce(duration_ms,1200000)/60000.0)),0) into used_minutes
   from public.automation_runner_runs where store_id=s.store_id and started_at>=date_trunc('month',now());
  if used_minutes+20>s.monthly_limit_minutes then
   update public.automation_runner_settings set last_dispatch_error='月間運用上限に達しました。未実行ジョブは待機中です' where store_id=s.store_id;
   continue;
  end if;
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

revoke all on function public.enqueue_estama_direct_diary(uuid), public.claim_estama_direct_job(uuid,text),
 public.finish_estama_direct_job(uuid,uuid,text,text,jsonb,text),public.manage_estama_direct_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_estama_direct_diary(uuid),public.claim_estama_direct_job(uuid,text),
 public.finish_estama_direct_job(uuid,uuid,text,text,jsonb,text),public.manage_estama_direct_job(uuid,uuid,text) to service_role;
revoke all on function private.watch_estama_direct_runner(),private.dispatch_estama_direct_runner() from public,anon,authenticated;
select cron.schedule('estama-direct-runner-watch','* * * * *','select private.watch_estama_direct_runner(); select private.dispatch_estama_direct_runner();');
commit;
