-- シフトの中休み（休憩）。1つの出勤に休憩を1つ（例：18:00〜19:00）。
-- 休憩の時間は、HPの空き枠・予約画面・O2の空き状況・X投稿の「最短◯時〜」に出さない（src/lib/shiftBreak.ts）。
-- エステ魂の仮予約の判定（休憩にかかる希望は「出勤の時間外」）と、セラピストアピール（休憩中の人は選ばない）も休憩を見る。

alter table public.shifts add column if not exists break_start time;
alter table public.shifts add column if not exists break_end time;

alter table public.shifts drop constraint if exists shifts_break_pair;
alter table public.shifts add constraint shifts_break_pair check (
  (break_start is null and break_end is null)
  or (break_start is not null and break_end is not null and break_start <> break_end)
);

comment on column public.shifts.break_start is '中休みの開始（break_end と両方入っているときだけ有効）';
comment on column public.shifts.break_end is '中休みの終了';

-- その時刻が休憩中か（日をまたぐ出勤・休憩にも対応）
create or replace function public.shift_on_break(
  p_date date, p_start time, p_break_start time, p_break_end time, p_at timestamptz
)
returns boolean
language sql stable
set search_path = ''
as $$
  select case
    when p_break_start is null or p_break_end is null or p_break_start = p_break_end then false
    else p_at >= ((p_date + p_break_start + case when p_break_start < p_start then interval '1 day' else interval '0' end) at time zone 'Asia/Tokyo')
     and p_at < ((p_date + p_break_start + case when p_break_start < p_start then interval '1 day' else interval '0' end
                  + case when p_break_end > p_break_start then p_break_end - p_break_start else p_break_end - p_break_start + interval '1 day' end) at time zone 'Asia/Tokyo')
  end
$$;

grant execute on function public.shift_on_break(date, time, time, time, timestamptz) to anon, authenticated, service_role;

-- エステ魂の仮予約：希望の時間が休憩にかかれば「出勤の時間外」
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
  return jsonb_build_object('castId', v_cast.id, 'status', 'ok', 'note', v_cast.name || 'さん：HPの出勤 ' || to_char(v_shift.start_time, 'HH24:MI') || '〜' || to_char(v_shift.end_time, 'HH24:MI')
    || case when v_shift.break_start is not null and v_shift.break_end is not null then '（休憩 ' || to_char(v_shift.break_start, 'HH24:MI') || '〜' || to_char(v_shift.break_end, 'HH24:MI') || '）' else '' end);
end;
$function$;

-- エステ魂のセラピストアピール：休憩中の人は選ばない・休憩中の人しかいなければ呼ばない
do $$
declare
  v_def text;
  v_new text;
  v_cond constant text := E'\n      and not public.shift_on_break(shift_row.shift_date, shift_row.start_time, shift_row.break_start, shift_row.break_end, now())';
begin
  v_def := pg_get_functiondef('public.claim_estama_appeal_slot(text, uuid, integer, timestamptz)'::regprocedure);
  if position('shift_on_break' in v_def) = 0 then
    v_new := replace(v_def, E'      ) at time zone ''Asia/Tokyo''\n    order by cast_row.id', E'      ) at time zone ''Asia/Tokyo''' || v_cond || E'\n    order by cast_row.id');
    if v_new = v_def then raise exception 'claim_estama_appeal_slot: 書き換える場所が見つかりません'; end if;
    execute v_new;
  end if;

  v_def := pg_get_functiondef('private.dispatch_estama_therapist_appeal()'::regprocedure);
  if position('shift_on_break' in v_def) = 0 then
    v_new := replace(v_def, E'      ) at time zone ''Asia/Tokyo''\n      and (\n        select count(*)', E'      ) at time zone ''Asia/Tokyo''' || v_cond || E'\n      and (\n        select count(*)');
    if v_new = v_def then raise exception 'dispatch_estama_therapist_appeal: 書き換える場所が見つかりません'; end if;
    execute v_new;
  end if;
end
$$;

-- セラピストのマイページ：その月の出勤の休憩（get_therapist_shifts と同じ本人確認）
create or replace function public.get_therapist_shift_breaks(p_token text, p_year integer, p_month integer)
returns table(id uuid, break_start time, break_end time)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_cast_id uuid;
  v_start date;
begin
  if p_token is null or length(p_token) < 8 then
    raise exception 'invalid token';
  end if;
  select c.id into v_cast_id from public.casts c where c.access_token = p_token;
  if v_cast_id is null then
    raise exception 'cast not found';
  end if;
  v_start := make_date(p_year, p_month, 1);
  return query
  select s.id, s.break_start, s.break_end
  from public.shifts s
  where s.cast_id = v_cast_id
    and s.shift_date >= v_start and s.shift_date < (v_start + interval '1 month')::date
    and s.break_start is not null and s.break_end is not null;
end
$$;

revoke all on function public.get_therapist_shift_breaks(text, integer, integer) from public;
grant execute on function public.get_therapist_shift_breaks(text, integer, integer) to anon, authenticated;
