create or replace function private.dispatch_estama_direct_runner() returns void
language plpgsql security definer set search_path='' as $$
declare s public.automation_runner_settings; token text; request_id bigint; response_status integer;
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

revoke all on function private.dispatch_estama_direct_runner() from public,anon,authenticated;
update public.automation_runner_settings set last_dispatch_error=null where last_dispatch_error='月間運用上限に達しました。未実行ジョブは待機中です';
