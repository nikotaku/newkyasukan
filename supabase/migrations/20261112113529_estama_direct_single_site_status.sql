create or replace function public.finish_estama_direct_job(p_job_id uuid,p_lease uuid,p_run_id text,p_status text,p_result jsonb,p_error text)
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
 update public.cast_posts set status=case when o2_status in ('posted','skipped') and esutama_status='posted' then 'posted' when o2_status='failed' or esutama_status='failed' then 'failed' else 'pending' end where id=post_id;
 update public.automation_runner_runs set processed=processed+1,heartbeat_at=now() where run_id=p_run_id;
 return true;
end $$;


-- Repair only verified completed direct-runner posts; never enqueue or resend.
update public.cast_posts p set status='posted' where p.esutama_status='posted' and p.o2_status in ('posted','skipped') and exists(select 1 from public.automation_jobs j where j.runner='github_actions' and j.status='completed' and j.payload->>'post_id'=p.id::text);

