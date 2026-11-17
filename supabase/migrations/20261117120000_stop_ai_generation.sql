-- AIで自動で作る機能を一旦すべて止める（2026-11-17）。必要になったものから作り直す。
-- 公式LINEのAI自動応答：設定をオフにして、毎分の見回り（pg_cron）も止める。
update public.line_customer_settings set auto_reply = false where auto_reply;

select cron.alter_job(jobid, active := false)
from cron.job
where jobname in ('line-customer-auto-reply-every-minute', 'auto-hp-news');
