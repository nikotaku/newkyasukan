-- 連絡先・SNS（正本）をエステ魂・O2へ書き換えたら、「エスたま自動化履歴」（estama_sync_reports）に1件残す。
-- results の kind = 'store_contact'（画面は src/pages/EstamaSyncHistory.tsx）
create or replace function public.finish_store_contact_sync(p_run_token text, p_target text, p_status text, p_result jsonb, p_error text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_store uuid;
  v_row public.store_contact_sync%rowtype;
  v_label text;
  v_fields int;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;
  if p_status not in ('done', 'failed', 'review_required') then raise exception '状態が正しくありません'; end if;
  update public.store_contact_sync
  set status = p_status, finished_at = now(), result = coalesce(p_result, '{}'::jsonb), error = left(p_error, 1000)
  where store_id = v_store and target = p_target and status = 'running'
  returning * into v_row;
  if not found then return; end if;

  v_label := case p_target when 'estama' then 'エステ魂' when 'o2' then 'O2' else p_target end;
  v_fields := coalesce(jsonb_array_length(case when jsonb_typeof(p_result->'fields') = 'array' then p_result->'fields' end), 0);
  insert into public.estama_sync_reports (store_id, status, started_at, finished_at, total_count, success_count, summary, results, fatal_error)
  values (
    v_store,
    case p_status when 'done' then 'success' when 'review_required' then 'warning' else 'error' end,
    v_row.started_at, now(), v_fields,
    case when p_status = 'done' then v_fields else 0 end,
    case p_status
      when 'done' then '連絡先・SNSを' || v_label || 'に反映しました'
        || case when p_target = 'o2' then '（電話・X・LINE。メールは変えられない欄、外部ブログはO2の店舗ページそのもの）' else '（電話・メール・LINE・X・ブログ）' end
        || case when coalesce((p_result->>'changed')::boolean, (p_result->>'contactChanged')::boolean or (p_result->>'infoChanged')::boolean, true) then '' else '。変更はありませんでした' end
      when 'review_required' then '連絡先・SNSの' || v_label || 'への反映を確認してください'
      else '連絡先・SNSを' || v_label || 'に反映できませんでした（自動でやり直します）'
    end,
    jsonb_build_array(jsonb_build_object('kind', 'store_contact', 'target', p_target, 'values', v_row.values_snapshot, 'attempts', v_row.attempts)
      || coalesce(p_result, '{}'::jsonb)),
    left(p_error, 1000)
  );
end;
$function$;

-- 11/27 のエステ魂への反映（このログを足す前）の分も残す
insert into public.estama_sync_reports (store_id, status, started_at, finished_at, total_count, success_count, summary, results)
select s.store_id, 'success', s.started_at, s.finished_at, 7, 7,
  '連絡先・SNSをエステ魂に反映しました（電話・メール・LINE・X・ブログ）',
  jsonb_build_array(jsonb_build_object('kind', 'store_contact', 'target', 'estama', 'values', s.values_snapshot, 'attempts', s.attempts) || coalesce(s.result, '{}'::jsonb))
from public.store_contact_sync s
where s.target = 'estama' and s.status = 'done'
  and not exists (select 1 from public.estama_sync_reports r where r.store_id = s.store_id and r.results @> '[{"kind":"store_contact"}]');

-- O2 の店舗アカウントへの書き換え（estama-scout の mode o2-contact、本体 server/o2-store-profile.ts）も同じ見回りで動かす。
-- 実行トークンの受け取り（claim_estama_scout_run）がエステ魂の接続を見るので、エステ魂がログイン済みの店舗だけ
create or replace function private.dispatch_store_contact_sync()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  r record;
  v_calls integer := 0;
  v_minute integer := extract(minute from timezone('Asia/Tokyo', now()))::int;
begin
  if v_minute between 25 and 44 then return 0; end if;
  for r in
    select sc.store_id, sc.target from public.store_contact_sync sc
    join public.automation_connections c on c.store_id = sc.store_id and c.provider = 'estama' and c.status = 'ready' and c.browserbase_context_id is not null
    where sc.target in ('estama', 'o2')
      and (sc.status = 'pending'
        or (sc.status = 'failed' and sc.attempts < 3 and sc.finished_at < now() - interval '30 minutes')
        or (sc.status = 'running' and sc.started_at < now() - interval '15 minutes' and sc.attempts < 3))
    order by sc.target
  loop
    -- 同じ店舗のエステ魂とO2は同時に動かさない（実行トークンの受け取りが1つずつのため）。O2は次の回にまわす
    if r.target = 'o2' and v_calls > 0 then continue; end if;
    perform private.estama_scout_call(r.store_id, case r.target when 'o2' then 'o2-contact' else 'store-contact' end, null);
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end;
$function$;
