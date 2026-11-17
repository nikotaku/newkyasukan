-- GitHub Actions は実行ごとに接続元（IPアドレス）が変わり、エステ魂がその一部を 403 Forbidden で断る。
-- 今すぐご案内が 403 で失敗したら、1分後に起動し直す（別の接続元になる）。20分のうちに3回まで。
create or replace function private.retry_estama_availability_dispatch()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1
    from public.automation_runner_settings as settings
    where settings.availability_enabled
      and settings.availability_requested_at is null
      and not exists (
        select 1 from public.automation_runner_runs as run
        where run.store_id = settings.store_id and run.purpose = 'availability' and run.status = 'running'
      )
      and (
        select count(*) from public.estama_sync_reports as report
        where report.store_id = settings.store_id
          and report.created_at > now() - interval '20 minutes'
          and report.summary like '%ご案内状況%'
      ) between 1 and 2
      and exists (
        select 1 from (
          select report.status, report.fatal_error, report.finished_at
          from public.estama_sync_reports as report
          where report.store_id = settings.store_id and report.summary like '%ご案内状況%'
          order by report.created_at desc
          limit 1
        ) as latest
        where latest.status = 'error'
          and latest.fatal_error like '%403 Forbidden%'
          and latest.finished_at < now() - interval '1 minute'
      )
  ) then
    return null;
  end if;
  return private.dispatch_estama_availability_refresh();
end;
$$;

select cron.schedule('estama-availability-retry-on-block', '* * * * *', 'select private.retry_estama_availability_dispatch();');
