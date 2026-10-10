-- エステ魂の自動再ログイン：「ログイン画面を開く」を押したまま終わっていない（ログイン作業中のまま15分以上）接続も、
-- 登録したメールアドレス・パスワードでログインし直す（2026年10月：艶華がこの状態で止まり、自動再ログインが動かなかった）

create or replace function private.dispatch_estama_relogin()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_raw_token text;
  v_wait interval;
  v_calls integer := 0;
begin
  for r in
    select connection.store_id, state.last_attempt_at, coalesce(state.consecutive_failures, 0) as failures,
           state.alerted_at, private.estama_admin_login(connection.store_id) is not null as has_login
    from public.automation_connections as connection
    left join private.estama_relogin_state as state on state.store_id = connection.store_id
    where connection.provider = 'estama'
      and connection.status in ('expired', 'error', 'login_in_progress')
      and connection.browserbase_context_id is not null
      and (connection.status = 'expired'
        or (connection.status = 'error' and connection.last_error ilike '%ログイン%')
        -- 「ログイン画面を開く」を押したまま終わっていない（15分以上）ものも、登録した情報でログインし直す
        or (connection.status = 'login_in_progress' and connection.updated_at < now() - interval '15 minutes'))
  loop
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
    v_wait := case when r.failures >= 3 then interval '6 hours' else interval '10 minutes' end;
    if r.last_attempt_at is not null and r.last_attempt_at > now() - v_wait then
      continue;
    end if;

    insert into private.estama_relogin_state (store_id, last_attempt_at, updated_at)
    values (r.store_id, now(), now())
    on conflict (store_id) do update set last_attempt_at = now(), updated_at = now();

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
