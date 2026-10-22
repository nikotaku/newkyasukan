-- 「シフト空き枠レポート」（毎月1・11・21日 9:00 にLINEへ送っていた）を止める。オーナーの依頼（2026-10）
-- 関数 shift-availability-report は残してあるので、戻すときは active を true にする
select cron.alter_job(job_id := jobid, active := false)
from cron.job
where jobname = 'shift-availability-report';
