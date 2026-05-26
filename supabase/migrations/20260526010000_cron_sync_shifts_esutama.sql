-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule hourly sync of shifts to エスたま (estama.jp)
SELECT cron.schedule(
  'sync-shifts-esutama',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/sync-shifts-esutama',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
