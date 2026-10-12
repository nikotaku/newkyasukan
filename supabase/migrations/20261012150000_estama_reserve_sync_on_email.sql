-- エステ魂の仮予約を、メールが届いた時点ですぐ取り込む
-- Gmail（scripts/gmail-report-sync.gs、1分ごと）→ report-email-ingest が仮予約のメール（またはIVRyに来た 0120-286-634 の自動音声の着信通知）を受けたら
-- RPC request_estama_reserve_sync で「読みに行って」の印を付け、すぐにエステ魂の「お店への予約」を読みに行く。
-- 別のエスたま処理中で読めなかったときは、毎分の確認で印が消えるまでやり直す（読めたら save_estama_reservation_requests が印を消す）。
-- 5分ごとの定期の読み取りも念のため続ける。

create table if not exists private.estama_reserve_sync_requests (
  store_id uuid primary key,
  requested_at timestamptz not null default now(),
  last_dispatched_at timestamptz
);

-- report-email-ingest（service_role）から
create or replace function public.request_estama_reserve_sync(p_store_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.estama_reserve_sync_requests (store_id, requested_at, last_dispatched_at)
  values (p_store_id, now(), null)
  on conflict (store_id) do update set requested_at = now(), last_dispatched_at = null;
  return private.dispatch_estama_reserve_sync();
end;
$$;
revoke all on function public.request_estama_reserve_sync(uuid) from public, anon, authenticated;
grant execute on function public.request_estama_reserve_sync(uuid) to service_role;

-- 毎分：印があればすぐ（前回の呼び出しから1分以上あけて）、無ければ 2,7,12,17,22,47,52,57分の定期分だけ
create or replace function private.dispatch_estama_reserve_sync()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_calls integer := 0;
  v_now timestamp := timezone('Asia/Tokyo', now());
  v_hour integer := extract(hour from v_now)::int;
  v_regular boolean := extract(minute from v_now)::int in (2, 7, 12, 17, 22, 47, 52, 57) and not (v_hour between 4 and 9);
begin
  for r in
    select c.store_id, q.store_id is not null as requested
    from public.automation_connections c
    left join private.estama_reserve_sync_requests q
      on q.store_id = c.store_id and q.requested_at > now() - interval '20 minutes'
     and (q.last_dispatched_at is null or q.last_dispatched_at < now() - interval '50 seconds')
    where c.provider = 'estama' and c.status = 'ready' and c.browserbase_context_id is not null
      and coalesce((select (s.settings ->> 'estama_reserve_sync')::boolean from public.stores s where s.id = c.store_id), true)
  loop
    if not (r.requested or v_regular) then continue; end if;
    update private.estama_reserve_sync_requests set last_dispatched_at = now() where store_id = r.store_id;
    perform private.estama_scout_call(r.store_id, 'reserve-sync', null);
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end;
$$;

-- 読めたら印を消す（save_estama_reservation_requests の最後で呼ぶ）
create or replace function private.clear_estama_reserve_sync_request(p_store_id uuid)
returns void language sql security definer set search_path = '' as $$
  update private.estama_reserve_sync_requests set requested_at = now() - interval '1 day' where store_id = p_store_id
$$;

-- 保存の最後で印を消す（save_estama_reservation_requests を差し替え。中身は 20261012090000 と同じ＋最後の1行）
create or replace function public.save_estama_reservation_requests(p_run_token text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_item jsonb;
  v_row public.estama_reservation_requests;
  v_check jsonb;
  v_registered uuid;
  v_new integer := 0;
  v_seen integer := 0;
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 100 loop
    if coalesce(v_item ->> 'externalKey', '') = '' or coalesce(v_item ->> 'hopeDate', '') = '' then continue; end if;
    v_seen := v_seen + 1;
    insert into public.estama_reservation_requests as t (
      store_id, external_key, received_at, hope_date, hope_time, nomination_label, is_free, cast_name,
      course_label, course_minutes, course_price, nomination_fee, total_price, coupon, request_note,
      visit_kind, member_label, customer_name, customer_phone, customer_email
    ) values (
      v_store, left(v_item ->> 'externalKey', 200), (v_item ->> 'receivedAt')::timestamptz,
      (v_item ->> 'hopeDate')::date, (v_item ->> 'hopeTime')::time,
      left(v_item ->> 'nominationLabel', 100), coalesce((v_item ->> 'isFree')::boolean, false), left(v_item ->> 'castName', 100),
      left(v_item ->> 'courseLabel', 200), (v_item ->> 'courseMinutes')::int, (v_item ->> 'coursePrice')::int,
      (v_item ->> 'nominationFee')::int, (v_item ->> 'totalPrice')::int, left(v_item ->> 'coupon', 300), left(v_item ->> 'requestNote', 1000),
      left(v_item ->> 'visitKind', 20), left(v_item ->> 'memberLabel', 20), left(v_item ->> 'customerName', 100),
      left(v_item ->> 'customerPhone', 20), left(v_item ->> 'customerEmail', 200)
    )
    on conflict (store_id, external_key) do update set last_seen_at = now()
    returning * into v_row;
    if v_row.first_seen_at >= now() - interval '5 seconds' then v_new := v_new + 1; end if;

    -- 対応前のものだけ、毎回判定し直す（あとからHPに出勤が入ることもある）
    if v_row.status = 'new' then
      v_registered := private.find_registered_reservation(v_row);
      v_check := private.check_estama_request(v_row);
      update public.estama_reservation_requests set
        cast_id = (v_check ->> 'castId')::uuid,
        check_status = v_check ->> 'status',
        check_note = v_check ->> 'note',
        status = case when v_registered is not null then 'registered' else status end,
        reservation_id = coalesce(v_registered, reservation_id),
        handled_at = case when v_registered is not null then now() else handled_at end
      where id = v_row.id;
    end if;
  end loop;
  perform private.clear_estama_reserve_sync_request(v_store);
  return jsonb_build_object('seen', v_seen, 'new', v_new);
end;
$$;


-- 毎分確認する（印が無ければ定期の分だけ読む）
select cron.schedule('estama-reserve-sync', '* * * * *', 'select private.dispatch_estama_reserve_sync()');
