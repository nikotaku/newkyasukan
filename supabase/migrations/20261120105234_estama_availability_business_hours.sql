-- pg_cron uses GMT. 03:00–16:00 UTC = 12:00–01:00 Asia/Tokyo (14 runs).
select cron.alter_job(jobid, schedule := '0 3-16 * * *') from cron.job where jobname='estama-availability-hourly';
-- Keep normal updates hourly; do not add shift-start executions.
select cron.alter_job(jobid, active := false) from cron.job where jobname='estama-availability-on-shift-start';
-- Retain recovery after failures, only within the configured operating hours.
select cron.alter_job(jobid, schedule := '* 3-16 * * *') from cron.job where jobname='estama-availability-retry-on-block';
