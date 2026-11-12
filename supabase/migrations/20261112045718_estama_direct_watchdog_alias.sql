CREATE OR REPLACE FUNCTION private.watch_estama_direct_runner()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 where dispatch_requested_at<now()-interval '10 minutes' and exists(select 1 from public.automation_jobs pending_job where pending_job.store_id=s.store_id and pending_job.runner='github_actions' and pending_job.status='queued')
 and not exists(select 1 from public.automation_runner_runs r where r.store_id=s.store_id and r.started_at>s.dispatch_requested_at);
end $function$

