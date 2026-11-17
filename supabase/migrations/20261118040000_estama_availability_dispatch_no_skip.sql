-- 今すぐご案内の起動役が、毎分の直接実行の起動役（automation_runner_settings を for update skip locked で読む）と
-- 同じ分に動くと、店舗の行が飛ばされて更新されないことがあった。行のロックを取らずに読む。
create or replace function private.dispatch_estama_availability_refresh()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_raw_token text;
  v_token_hash text;
  v_request_id bigint;
  v_github_token text;
  s record;
begin
  update public.estama_sync_reports as report
  set status = 'error',
      finished_at = now(),
      summary = '⚠️ エスたま ご案内状況の更新が途中で中断されました。' || E'\n'
        || '次回の毎時実行で自動再試行します。',
      fatal_error = '毎時更新の呼び出しが完了しませんでした'
  where report.status = 'warning'
    and report.summary = '⏳ エスたま ご案内状況の毎時更新を開始しました。'
    and report.created_at < now() - interval '15 minutes'
    and report.results @> jsonb_build_object('kind', 'availability_refresh');

  -- GitHub Actions に切り替えた店舗（Browserbase のログイン状態は見ない。毎回メール・パスワードでログインする）
  for s in
    select settings.store_id, connection.shop_id
    from public.automation_runner_settings as settings
    join public.automation_connections as connection
      on connection.store_id = settings.store_id and connection.provider = 'estama'
    where settings.availability_enabled
  loop
    select decrypted_secret into v_github_token from vault.decrypted_secrets where name = 'estama_github_actions_dispatch_token';
    if coalesce(v_github_token, '') = '' then
      update public.automation_runner_settings set last_dispatch_error = 'GitHub Actions起動用の認証設定が未完了です' where store_id = s.store_id;
      continue;
    end if;
    insert into public.estama_sync_reports (
      store_id, shop_id, status, started_at, finished_at, total_count, success_count,
      cast_names, summary, results, evidence, missing_profiles, fatal_error
    ) values (
      s.store_id, s.shop_id, 'warning', now(), now(), 0, 0, array[]::text[],
      '⏳ エスたま ご案内状況の毎時更新を開始しました。',
      jsonb_build_object('kind', 'availability_refresh', 'runner', 'github_actions'),
      '[]'::jsonb, array[]::text[], null
    );
    update public.automation_runner_settings set availability_requested_at = now() where store_id = s.store_id;
    select net.http_post(
      url := 'https://api.github.com/repos/nikotaku/newkyasukan/actions/workflows/estama-direct-runner.yml/dispatches',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_github_token, 'Accept', 'application/vnd.github+json',
        'Content-Type', 'application/json', 'X-GitHub-Api-Version', '2022-11-28'),
      body := '{"ref":"main","inputs":{"mode":"availability"}}'::jsonb,
      timeout_milliseconds := 10000
    ) into v_request_id;
  end loop;

  -- まだ Browserbase の店舗（今まで通り Vercel を呼ぶ）
  if not exists (
    select 1
    from public.automation_connections as connection
    where connection.provider = 'estama'
      and connection.status = 'ready'
      and connection.browserbase_context_id is not null
      and not exists (select 1 from public.automation_runner_settings as settings
        where settings.store_id = connection.store_id and settings.availability_enabled)
  ) then
    return v_request_id;
  end if;

  -- 古いトークンの掃除は毎分のプロフィール同期の起動役などが行う
  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  insert into public.estama_sync_tokens (token_hash, purpose, expires_at)
  values (v_token_hash, 'availability-refresh', now() + interval '10 minutes');

  insert into public.estama_sync_reports (
    store_id, shop_id, status, started_at, finished_at, total_count, success_count,
    cast_names, summary, results, evidence, missing_profiles, fatal_error
  )
  select
    connection.store_id, connection.shop_id, 'warning', now(), now(), 0, 0, array[]::text[],
    '⏳ エスたま ご案内状況の毎時更新を開始しました。',
    jsonb_build_object('kind', 'availability_refresh', 'dispatch_token_hash', v_token_hash),
    '[]'::jsonb, array[]::text[], null
  from public.automation_connections as connection
  where connection.provider = 'estama'
    and connection.status = 'ready'
    and connection.browserbase_context_id is not null
    and not exists (select 1 from public.automation_runner_settings as settings
      where settings.store_id = connection.store_id and settings.availability_enabled);

  select net.http_post(
    url := 'https://newkyasukan.vercel.app/api/cron/estama-availability',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('token', v_raw_token),
    timeout_milliseconds := 300000
  ) into v_request_id;

  return v_request_id;
end;
$$;
