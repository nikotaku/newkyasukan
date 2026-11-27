-- 連絡先・SNS（正本）をエステ魂の店舗基本情報へ書き換えるワーカーの受け口と起動役。
-- ワーカーは /api/cron/estama-appeal?action=estama-scout（mode: store-contact、server/estama-store-contact.ts）。

create or replace function public.start_store_contact_sync(p_run_token text, p_target text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_row public.store_contact_sync;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;
  update public.store_contact_sync
  set status = 'running', started_at = now(), attempts = attempts + 1, error = null,
      values_snapshot = coalesce(private.store_contact_values(v_store), values_snapshot)
  where store_id = v_store and target = p_target and status in ('pending', 'failed', 'running')
  returning * into v_row;
  if v_row.store_id is null then return null; end if;
  return jsonb_build_object('storeId', v_store, 'values', v_row.values_snapshot);
end;
$$;
revoke all on function public.start_store_contact_sync(text, text) from public, anon, authenticated;
grant execute on function public.start_store_contact_sync(text, text) to service_role, anon;

create or replace function public.finish_store_contact_sync(p_run_token text, p_target text, p_status text, p_result jsonb, p_error text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;
  if p_status not in ('done', 'failed', 'review_required') then raise exception '状態が正しくありません'; end if;
  update public.store_contact_sync
  set status = p_status, finished_at = now(), result = coalesce(p_result, '{}'::jsonb), error = left(p_error, 1000)
  where store_id = v_store and target = p_target and status = 'running';
end;
$$;
revoke all on function public.finish_store_contact_sync(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_store_contact_sync(text, text, text, jsonb, text) to service_role, anon;

-- 起動役（5分ごと）：反映待ち・失敗（30分あけて3回まで）・止まった実行（15分）を拾う。毎時25〜44分は空き枠の更新と重ねない
create or replace function private.dispatch_store_contact_sync()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_calls integer := 0;
  v_minute integer := extract(minute from timezone('Asia/Tokyo', now()))::int;
begin
  if v_minute between 25 and 44 then return 0; end if;
  for r in
    select sc.store_id from public.store_contact_sync sc
    join public.automation_connections c on c.store_id = sc.store_id and c.provider = 'estama' and c.status = 'ready' and c.browserbase_context_id is not null
    where sc.target = 'estama'
      and (sc.status = 'pending'
        or (sc.status = 'failed' and sc.attempts < 3 and sc.finished_at < now() - interval '30 minutes')
        or (sc.status = 'running' and sc.started_at < now() - interval '15 minutes' and sc.attempts < 3))
  loop
    perform private.estama_scout_call(r.store_id, 'store-contact', null);
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end;
$$;
revoke all on function private.dispatch_store_contact_sync() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'store-contact-sync';
select cron.schedule('store-contact-sync', '*/5 * * * *', 'select private.dispatch_store_contact_sync();');
