-- セラピストごとの「新規のお客様は◯分まで」（例：望月せなさんは80分まで）
-- 予約は止めない（取りこぼさないため）。新規のお客様が上限より長いコースで予約したら知らせる：
--   WEB予約のスマホ通知のタイトル・WEB予約受付のカード・予約表の予約詳細（get_course_limit_alerts）、エステ魂の仮予約の判定（course_limit）
-- 新規 = その電話番号で施術済み（completed）の予約がまだ無い人（店舗をまたいで見る。過去データ店舗の来店も数える）

alter table public.casts add column if not exists new_customer_max_minutes integer
  check (new_customer_max_minutes is null or new_customer_max_minutes > 0);
comment on column public.casts.new_customer_max_minutes is '新規のお客様が予約できるコースの上限（分）。超えたらアラート（予約は止めない）';

update public.casts set new_customer_max_minutes = 80
where id = '52e9f3a1-7be3-4228-8b01-60d2cb1c20a5' and new_customer_max_minutes is null; -- 望月せな

-- その電話番号で施術済みの予約があるか（p_before より前。省くと全期間）
create or replace function public.has_completed_visit(p_phone text, p_store_id uuid, p_exclude uuid default null, p_before timestamp default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select length(coalesce(public.norm_phone(p_phone), '')) >= 10 and exists (
    select 1 from public.reservations p
    where p.status = 'completed'
      and p.id is distinct from p_exclude
      and public.norm_phone(p.customer_phone) = public.norm_phone(p_phone)
      and (p_before is null or (p.reservation_date + coalesce(p.start_time, time '00:00')) < p_before)
  )
$$;
revoke all on function public.has_completed_visit(text, uuid, uuid, timestamp) from public, anon, authenticated;

-- 上限を超えている新規のお客様の予約（渡した予約の中から）。ログイン中のスタッフは所属店舗の予約だけ
create or replace function public.get_course_limit_alerts(p_reservation_ids uuid[])
returns table(reservation_id uuid, cast_id uuid, cast_name text, max_minutes integer, duration integer)
language sql stable security definer
set search_path = ''
as $$
  select r.id, c.id, c.name, c.new_customer_max_minutes, r.duration
  from public.reservations r
  join public.casts c on c.id = r.cast_id
  where r.id = any(p_reservation_ids)
    and r.status <> 'cancelled'
    and c.new_customer_max_minutes is not null
    and coalesce(r.duration, 0) > c.new_customer_max_minutes
    and (auth.role() = 'service_role'
      or exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = r.store_id))
    and not public.has_completed_visit(r.customer_phone, r.store_id, r.id, r.reservation_date + coalesce(r.start_time, time '00:00'))
$$;
revoke all on function public.get_course_limit_alerts(uuid[]) from public, anon;
grant execute on function public.get_course_limit_alerts(uuid[]) to authenticated, service_role;

-- エステ魂の仮予約の判定に course_limit を足す
create or replace function private.check_estama_request(r public.estama_reservation_requests)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  v_cast public.casts;
  v_business_date date := case when r.hope_time < time '06:00' then r.hope_date - 1 else r.hope_date end;
  v_start integer := private.business_minutes(r.hope_time);
  v_end integer := private.business_minutes(r.hope_time) + coalesce(r.course_minutes, 60);
  v_shift record;
  v_on_shift integer;
  v_overlap text;
  v_break_start integer;
  v_break_end integer;
begin
  if r.is_free then
    select count(distinct s.cast_id) into v_on_shift
    from public.shifts s join public.casts c on c.id = s.cast_id
    where s.store_id = r.store_id and s.shift_date = v_business_date and c.is_active and not coalesce(c.is_estama_dummy, false)
      and coalesce(s.status, '') not in ('cancelled', 'canceled', 'absent') and coalesce(s.approval_status, '') <> 'rejected'
      and private.business_minutes(s.start_time) <= v_start
      and (case when private.business_minutes(s.end_time) <= private.business_minutes(s.start_time) then private.business_minutes(s.end_time) + 1440 else private.business_minutes(s.end_time) end) > v_start
      and not (s.break_start is not null and s.break_end is not null
        and private.business_minutes(s.break_start) <= v_start
        and (case when private.business_minutes(s.break_end) <= private.business_minutes(s.break_start) then private.business_minutes(s.break_end) + 1440 else private.business_minutes(s.break_end) end) > v_start);
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

  select s.start_time, s.end_time, s.break_start, s.break_end into v_shift from public.shifts s
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

  if v_shift.break_start is not null and v_shift.break_end is not null then
    v_break_start := private.business_minutes(v_shift.break_start);
    v_break_end := private.business_minutes(v_shift.break_end);
    if v_break_end <= v_break_start then v_break_end := v_break_end + 1440; end if;
    if v_break_start < v_end and v_break_end > v_start then
      return jsonb_build_object('castId', v_cast.id, 'status', 'outside_shift',
        'note', v_cast.name || 'さんは ' || to_char(v_shift.break_start, 'HH24:MI') || '〜' || to_char(v_shift.break_end, 'HH24:MI') || ' が休憩です（希望の時間が休憩にかかっています）');
    end if;
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

  -- 新規のお客様のコースの上限（casts.new_customer_max_minutes）。エステ魂の「リピート予約」と、電話番号で来店済みの人は新規ではない
  if v_cast.new_customer_max_minutes is not null
     and coalesce(r.course_minutes, 0) > v_cast.new_customer_max_minutes
     and r.visit_kind is distinct from 'リピート予約'
     and not public.has_completed_visit(r.customer_phone, r.store_id) then
    return jsonb_build_object('castId', v_cast.id, 'status', 'course_limit',
      'note', v_cast.name || 'さんは新規のお客様は' || v_cast.new_customer_max_minutes || '分まで（' || r.course_minutes || '分で予約されています）');
  end if;
  return jsonb_build_object('castId', v_cast.id, 'status', 'ok', 'note', v_cast.name || 'さん：HPの出勤 ' || to_char(v_shift.start_time, 'HH24:MI') || '〜' || to_char(v_shift.end_time, 'HH24:MI')
    || case when v_shift.break_start is not null and v_shift.break_end is not null then '（休憩 ' || to_char(v_shift.break_start, 'HH24:MI') || '〜' || to_char(v_shift.break_end, 'HH24:MI') || '）' else '' end);
end;
$function$;
