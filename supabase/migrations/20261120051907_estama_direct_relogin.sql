alter table public.automation_runner_settings add column if not exists relogin_enabled boolean not null default false;
-- エステ魂の自動再ログイン：「ログイン画面を開く」を押したまま終わっていない（ログイン作業中のまま15分以上）接続も、
-- 登録したメールアドレス・パスワードでログインし直す（2026年10月：艶華がこの状態で止まり、自動再ログインが動かなかった）

create or replace function private.dispatch_estama_relogin()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_raw_token text; v_github_token text; v_request bigint;
  v_wait interval;
  v_calls integer := 0;
begin
  for r in
    select connection.store_id, coalesce(settings.relogin_enabled,false) as direct, state.last_attempt_at, coalesce(state.consecutive_failures, 0) as failures,
           state.last_success_at, state.alerted_at, private.estama_admin_login(connection.store_id) is not null as has_login
    from public.automation_connections as connection
    left join public.automation_runner_settings settings on settings.store_id=connection.store_id
    left join private.estama_relogin_state as state on state.store_id = connection.store_id
    where connection.provider = 'estama'
      and (coalesce(settings.relogin_enabled,false) or connection.status in ('expired', 'error', 'login_in_progress'))
      and (coalesce(settings.relogin_enabled,false) or connection.browserbase_context_id is not null)
      and ((coalesce(settings.relogin_enabled,false) and (state.last_success_at is null or state.last_success_at < now()-interval '6 hours')) or connection.status = 'expired'
        or (connection.status = 'error' and connection.last_error ilike '%ログイン%')
        -- 「ログイン画面を開く」を押したまま終わっていない（15分以上）ものも、登録した情報でログインし直す
        or (connection.status = 'login_in_progress' and connection.updated_at < now() - interval '15 minutes'))
  loop
    if r.direct and r.last_attempt_at<now()-interval '25 minutes'
       and (r.last_success_at is null or r.last_success_at<r.last_attempt_at)
       and not exists(select 1 from public.estama_login_alerts where store_id=r.store_id and kind='relogin_failed' and created_at>now()-interval '6 hours') then
      insert into public.estama_login_alerts(store_id,kind,message) values(r.store_id,'relogin_failed','再ログインの完了を確認できません。起動失敗や中断を含め、自動再試行を継続します');
    end if;
    if not r.has_login then
      if not exists (
        select 1 from public.estama_login_alerts a
        where a.store_id = r.store_id and a.kind = 'no_credentials' and a.created_at > now() - interval '1 day'
      ) then
        insert into public.estama_login_alerts (store_id, kind, message)
        values (r.store_id, 'no_credentials', 'エステ魂のログインが切れています。自動再ログイン用のメールアドレス・パスワードが未登録です');
      end if;
      continue;
    end if;
    v_wait := case when r.direct then interval '30 minutes' when r.failures >= 3 then interval '6 hours' else interval '10 minutes' end;
    if r.last_attempt_at is not null and r.last_attempt_at > now() - v_wait then
      continue;
    end if;

    insert into private.estama_relogin_state (store_id, last_attempt_at, updated_at)
    values (r.store_id, now(), now())
    on conflict (store_id) do update set last_attempt_at = now(), updated_at = now();

    if r.direct then
      if exists(select 1 from public.automation_runner_runs where store_id=r.store_id and purpose='relogin' and status='running' and heartbeat_at>now()-interval '5 minutes') then continue; end if;
      select decrypted_secret into v_github_token from vault.decrypted_secrets where name='estama_github_actions_dispatch_token';
      if coalesce(v_github_token,'')='' then
        update public.automation_runner_settings set last_dispatch_error='再ログインのGitHub起動キーが未登録です' where store_id=r.store_id;
        continue;
      end if;
      select net.http_post(
        url:='https://api.github.com/repos/nikotaku/newkyasukan/actions/workflows/estama-direct-runner.yml/dispatches',
        headers:=jsonb_build_object('Authorization','Bearer '||v_github_token,'Accept','application/vnd.github+json','Content-Type','application/json'),
        body:='{"ref":"main","inputs":{"mode":"relogin"}}'::jsonb,timeout_milliseconds:=10000) into v_request;
      v_calls:=v_calls+1;
      continue;
    end if;
    v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.estama_sync_tokens (token_hash, purpose, expires_at)
    values (encode(extensions.digest(v_raw_token, 'sha256'), 'hex'), 'estama-relogin:' || r.store_id::text, now() + interval '10 minutes');
    perform net.http_post(
      url := 'https://newkyasukan.vercel.app/api/cron/estama-appeal?action=estama-relogin',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('token', v_raw_token),
      timeout_milliseconds := 300000
    );
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end
$$;

create or replace function public.finish_estama_direct_relogin(p_store uuid,p_run text,p_ok boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.automation_runner_runs where run_id=p_run and store_id=p_store and purpose='relogin' and status='running') then raise exception 'invalid run'; end if;
 insert into private.estama_relogin_state(store_id) values(p_store) on conflict do nothing;
 if p_ok then
  update private.estama_relogin_state set last_success_at=now(),consecutive_failures=0,last_error=null,alerted_at=null,updated_at=now() where store_id=p_store;
  update public.automation_connections set status='ready',last_verified_at=now(),last_error=null,updated_at=now() where store_id=p_store and provider='estama';
  update public.automation_jobs set status='queued',available_at=now(),error_message=null where store_id=p_store and provider='estama' and runner='github_actions' and status='waiting_for_login' and submission_started_at is null;
 else
  update private.estama_relogin_state set consecutive_failures=consecutive_failures+1,last_error='新方式の再ログインに失敗しました。30分後以降に再試行します',updated_at=now() where store_id=p_store;
  if not exists(select 1 from public.estama_login_alerts where store_id=p_store and kind='relogin_failed' and created_at>now()-interval '6 hours') then
   insert into public.estama_login_alerts(store_id,kind,message) values(p_store,'relogin_failed','エステ魂に再ログインできません。認証情報・接続状態を確認してください。自動再試行は継続します');
  end if;
 end if;
 return true;
end $$;
revoke all on function public.finish_estama_direct_relogin(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_estama_direct_relogin(uuid,text,boolean) to service_role;
