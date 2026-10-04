-- エスたまへのプロフィール同期を、管理画面を開いていなくても裏で進める。
-- Vercel に管理用の鍵（SUPABASE_SECRET_KEY）を置く運用にしたので、止めていた定期実行を再開する。
-- 鍵がまだ無いあいだは、ワーカーが Supabase に触る前に失敗し、ディスパッチャーは15分あけて再試行するだけ。
select cron.alter_job(job_id := jobid, active := true)
from cron.job
where jobname = 'estama-profile-sync-every-minute';
