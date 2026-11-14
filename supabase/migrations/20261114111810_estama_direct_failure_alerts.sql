alter table public.estama_login_alerts drop constraint estama_login_alerts_kind_check;
alter table public.estama_login_alerts add constraint estama_login_alerts_kind_check check(kind in ('relogin_failed','no_credentials','automation_stopped'));
create or replace function private.alert_estama_direct_runner() returns void
language plpgsql security definer set search_path='' as $$
declare s public.automation_runner_settings; issues bigint; message_text text;
begin
 for s in select * from public.automation_runner_settings where diary_enabled loop
  select count(*) into issues from public.automation_jobs j where j.store_id=s.store_id and j.runner='github_actions'
   and (j.status in ('failed','review_required') or (j.status='queued' and j.available_at<now()-interval '15 minutes'));
  if issues=0 and s.last_dispatch_error is null then continue; end if;
  message_text:=format('写メ日記の失敗・要確認・15分以上の待機が%s件あります。%s 管理画面の自動化の稼働状況を確認してください。',issues,coalesce(s.last_dispatch_error,''));
  if not exists(select 1 from public.estama_login_alerts a where a.store_id=s.store_id and a.kind='automation_stopped' and a.created_at>now()-interval '6 hours') then
   insert into public.estama_login_alerts(store_id,kind,message) values(s.store_id,'automation_stopped',message_text);
  end if;
 end loop;
end $$;
revoke all on function private.alert_estama_direct_runner() from public,anon,authenticated;
select cron.schedule('estama-direct-runner-alerts','*/5 * * * *','select private.alert_estama_direct_runner()');
