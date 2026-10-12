-- エステ魂の仮予約（管理画面「お店への予約」）をHPのシステムに取り込む
-- 5分ごとに Browserbase でエステ魂の /admin/reserve/ を読み（読むだけ）、estama_reservation_requests に入れる。
-- HPの出勤が正しい前提で、指名のセラピストが「ダミー（is_estama_dummy）」「HPに出勤なし」「出勤の時間外」「予約が重なる」かを判定する。
-- 予約表への登録はスタッフが確認して行う（仮予約のまま確定SMS・セラピスト通知が飛ばないように、自動では予約を作らない）。
-- 同じお客様・同じ日時の予約がすでに予約表にあれば、自動で「登録済み」にする（手で入れた分と二重にならない）。

create table if not exists public.estama_reservation_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_key text not null,
  received_at timestamptz,
  hope_date date not null,
  hope_time time not null,
  nomination_label text,
  is_free boolean not null default false,
  cast_name text,
  cast_id uuid references public.casts(id) on delete set null,
  course_label text,
  course_minutes integer,
  course_price integer,
  nomination_fee integer,
  total_price integer,
  coupon text,
  request_note text,
  visit_kind text,
  member_label text,
  customer_name text,
  customer_phone text,
  customer_email text,
  -- ok = 出勤OK / dummy = ダミーのセラピスト宛て / unknown_cast = HPにいない名前 / no_shift = HPに出勤なし
  -- outside_shift = 出勤の時間外 / overlap = 予約が重なる / free = フリー（指名なし）
  check_status text not null default 'ok',
  check_note text,
  status text not null default 'new' check (status in ('new', 'registered', 'dismissed')),
  reservation_id uuid references public.reservations(id) on delete set null,
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (store_id, external_key)
);
create index if not exists idx_estama_reservation_requests_store on public.estama_reservation_requests (store_id, status, hope_date);

alter table public.estama_reservation_requests enable row level security;
revoke all on public.estama_reservation_requests from anon;
grant select on public.estama_reservation_requests to authenticated;
create policy estama_reservation_requests_read on public.estama_reservation_requests for select to authenticated
  using (store_id in (select public.current_store_ids()));

-- 名前の照合用（年齢・空白・記号・絵文字を除く）
create or replace function private.norm_cast_name(p_name text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(normalize(coalesce(p_name, ''), NFKC), '\(\d{1,2}\)', '', 'g'), '[^ぁ-んァ-ヶー一-龠々a-zA-Z0-9]', '', 'g')
$$;

-- 分（朝6時より前は翌日の続きとして +24時間）
create or replace function private.business_minutes(p_time time)
returns integer language sql immutable as $$
  select extract(hour from p_time)::int * 60 + extract(minute from p_time)::int + case when p_time < time '06:00' then 1440 else 0 end
$$;

-- 1件の判定（HPの出勤・ダミー・予約の重なり）
create or replace function private.check_estama_request(r public.estama_reservation_requests)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cast public.casts;
  v_business_date date := case when r.hope_time < time '06:00' then r.hope_date - 1 else r.hope_date end;
  v_start integer := private.business_minutes(r.hope_time);
  v_end integer := private.business_minutes(r.hope_time) + coalesce(r.course_minutes, 60);
  v_shift record;
  v_on_shift integer;
  v_overlap text;
begin
  if r.is_free then
    select count(distinct s.cast_id) into v_on_shift
    from public.shifts s join public.casts c on c.id = s.cast_id
    where s.store_id = r.store_id and s.shift_date = v_business_date and c.is_active and not coalesce(c.is_estama_dummy, false)
      and coalesce(s.status, '') not in ('cancelled', 'canceled', 'absent') and coalesce(s.approval_status, '') <> 'rejected'
      and private.business_minutes(s.start_time) <= v_start
      and (case when private.business_minutes(s.end_time) <= private.business_minutes(s.start_time) then private.business_minutes(s.end_time) + 1440 else private.business_minutes(s.end_time) end) > v_start;
    return jsonb_build_object('castId', null, 'status', 'free',
      'note', case when v_on_shift > 0 then 'フリー（指名なし）：その時間にHPで出勤中 ' || v_on_shift || '人' else 'フリー（指名なし）：その時間にHPで出勤中の人がいません' end);
  end if;

  select c.* into v_cast from public.casts c
  where c.store_id = r.store_id and c.is_active and private.norm_cast_name(c.name) = private.norm_cast_name(r.cast_name)
  order by coalesce(c.is_estama_dummy, false), c.created_at limit 1;
  if v_cast.id is null then
    select c.* into v_cast from public.external_cast_profiles e join public.casts c on c.id = e.cast_id
    where e.provider = 'estama' and c.store_id = r.store_id and private.norm_cast_name(e.remote_name) = private.norm_cast_name(r.cast_name)
    limit 1;
  end if;
  if v_cast.id is null then
    return jsonb_build_object('castId', null, 'status', 'unknown_cast', 'note', '「' || coalesce(r.cast_name, '') || '」はHPのセラピストにいません（ダミー・退店の可能性）');
  end if;
  if coalesce(v_cast.is_estama_dummy, false) then
    return jsonb_build_object('castId', v_cast.id, 'status', 'dummy', 'note', v_cast.name || 'さんはエステ魂用のダミーです。出勤している子をご案内してください');
  end if;

  select s.start_time, s.end_time into v_shift from public.shifts s
  where s.cast_id = v_cast.id and s.shift_date = v_business_date
    and coalesce(s.status, '') not in ('cancelled', 'canceled', 'absent') and coalesce(s.approval_status, '') <> 'rejected'
  order by s.start_time limit 1;
  if v_shift.start_time is null then
    return jsonb_build_object('castId', v_cast.id, 'status', 'no_shift', 'note', v_cast.name || 'さんはその日HPに出勤がありません');
  end if;
  if not (private.business_minutes(v_shift.start_time) <= v_start
      and (case when private.business_minutes(v_shift.end_time) <= private.business_minutes(v_shift.start_time) then private.business_minutes(v_shift.end_time) + 1440 else private.business_minutes(v_shift.end_time) end) >= v_end) then
    return jsonb_build_object('castId', v_cast.id, 'status', 'outside_shift',
      'note', v_cast.name || 'さんのHPの出勤は ' || to_char(v_shift.start_time, 'HH24:MI') || '〜' || to_char(v_shift.end_time, 'HH24:MI') || '（希望の時間が出勤の外です）');
  end if;

  select to_char(x.start_time, 'HH24:MI') into v_overlap from public.reservations x
  where x.cast_id = v_cast.id and x.status <> 'cancelled'
    and (case when x.start_time < time '06:00' then x.reservation_date - 1 else x.reservation_date end) = v_business_date
    and private.business_minutes(x.start_time) < v_end
    and private.business_minutes(x.start_time) + coalesce(x.duration, 60) > v_start
    and public.norm_phone(x.customer_phone) is distinct from public.norm_phone(r.customer_phone)
  limit 1;
  if v_overlap is not null then
    return jsonb_build_object('castId', v_cast.id, 'status', 'overlap', 'note', v_cast.name || 'さんは ' || v_overlap || '〜 に別の予約があります');
  end if;
  return jsonb_build_object('castId', v_cast.id, 'status', 'ok', 'note', v_cast.name || 'さん：HPの出勤 ' || to_char(v_shift.start_time, 'HH24:MI') || '〜' || to_char(v_shift.end_time, 'HH24:MI'));
end;
$$;

-- 予約表に同じお客様・同じ日時（前後60分）の予約があれば、その予約
create or replace function private.find_registered_reservation(r public.estama_reservation_requests)
returns uuid
language sql stable security definer set search_path = '' as $$
  select x.id from public.reservations x
  where x.store_id = r.store_id and x.status <> 'cancelled'
    and coalesce(r.customer_phone, '') <> ''
    and public.norm_phone(x.customer_phone) = public.norm_phone(r.customer_phone)
    and (x.reservation_date + x.start_time) between (r.hope_date + r.hope_time) - interval '60 minutes' and (r.hope_date + r.hope_time) + interval '60 minutes'
  order by x.created_at desc limit 1
$$;

-- Vercel のワーカー（スカウトと同じ一回限りの実行トークン）から：読み取った仮予約を保存して判定する
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
  return jsonb_build_object('seen', v_seen, 'new', v_new);
end;
$$;

-- 管理画面：予約表に登録した（予約と結びつける）・対応不要にする・戻す
create or replace function public.set_estama_reservation_request(p_id uuid, p_status text, p_reservation_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.estama_reservation_requests where id = p_id;
  if v_store is null or auth.uid() is null or v_store not in (select public.current_store_ids()) then
    raise exception using message = 'この店舗の仮予約を操作する権限がありません', errcode = '42501';
  end if;
  if p_status not in ('new', 'registered', 'dismissed') then
    raise exception using message = '状態が正しくありません', errcode = '22023';
  end if;
  update public.estama_reservation_requests set
    status = p_status,
    reservation_id = case when p_status = 'registered' then coalesce(p_reservation_id, reservation_id) else reservation_id end,
    handled_by = case when p_status = 'new' then null else auth.uid() end,
    handled_at = case when p_status = 'new' then null else now() end
  where id = p_id;
end;
$$;

revoke all on function private.check_estama_request(public.estama_reservation_requests) from public, anon, authenticated;
revoke all on function private.find_registered_reservation(public.estama_reservation_requests) from public, anon, authenticated;
revoke all on function public.save_estama_reservation_requests(text, jsonb) from public;
grant execute on function public.save_estama_reservation_requests(text, jsonb) to anon, authenticated;
revoke all on function public.set_estama_reservation_request(uuid, text, uuid) from public, anon;
grant execute on function public.set_estama_reservation_request(uuid, text, uuid) to authenticated;

-- 5分ごと（朝10時〜深夜3時、毎時27〜42分の空き枠更新とは重ならないよう 2,7,12,17,22,47,52,57分）
create or replace function private.dispatch_estama_reserve_sync()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_calls integer := 0;
  v_hour integer := extract(hour from timezone('Asia/Tokyo', now()))::int;
begin
  if v_hour between 4 and 9 then return 0; end if;
  for r in
    select c.store_id from public.automation_connections c
    where c.provider = 'estama' and c.status = 'ready' and c.browserbase_context_id is not null
      and coalesce((select (s.settings ->> 'estama_reserve_sync')::boolean from public.stores s where s.id = c.store_id), true)
  loop
    perform private.estama_scout_call(r.store_id, 'reserve-sync', null);
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end;
$$;

select cron.schedule('estama-reserve-sync', '2,7,12,17,22,47,52,57 * * * *', 'select private.dispatch_estama_reserve_sync()');

-- スマホ通知：新しい仮予約（受付から1時間以内のものだけ。最初の取り込みで昔の分を一気に知らせない）
create or replace function public.trg_push_notify_estama_request()
returns trigger
language plpgsql security definer set search_path = 'public', 'extensions' as $$
begin
  if new.received_at is null or new.received_at < now() - interval '1 hour' then return new; end if;
  if not exists (select 1 from public.push_subscriptions s where 'web_booking' = any (s.topics) and s.store_id = new.store_id) then return new; end if;
  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-push-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_internal_secret')
    ),
    body := jsonb_build_object('event', 'estama_reserve', 'id', new.id)
  );
  return new;
exception when others then
  raise warning 'push notify skipped: %', sqlerrm;
  return new;
end;
$$;

-- 判定（check_status）が入った後に送るため、INSERT ではなく判定の UPDATE で1回だけ
create trigger estama_reservation_requests_push_notify after update of check_status on public.estama_reservation_requests
  for each row when (old.check_note is null and new.check_note is not null and new.status = 'new')
  execute function public.trg_push_notify_estama_request();
