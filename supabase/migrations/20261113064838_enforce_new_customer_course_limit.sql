-- Enforce the configured first-visit limit at the reservation write boundary.
-- Existing bookings are retained. New means no completed visit at this store.
CREATE OR REPLACE FUNCTION public.has_completed_visit(p_phone text, p_store_id uuid, p_exclude uuid DEFAULT NULL::uuid, p_before timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select length(coalesce(public.norm_phone(p_phone), '')) >= 10 and exists (
    select 1 from public.reservations p
    where p.status = 'completed'
      and p.store_id = p_store_id
      and p.id is distinct from p_exclude
      and public.norm_phone(p.customer_phone) = public.norm_phone(p_phone)
      and (p_before is null or (p.reservation_date + coalesce(p.start_time, time '00:00')) < p_before)
  )
$function$
;
revoke all on function public.has_completed_visit(text, uuid, uuid, timestamp) from public, anon, authenticated;

create or replace function private.estama_effective_course_minutes(p_label text, p_minutes integer)
returns integer language sql immutable security invoker set search_path = '' as $$
  select case
    when coalesce(p_label, '') like '%会員限定%110分%' then greatest(110, p_minutes)
    when coalesce(p_label, '') like '%会員限定%70分%' then greatest(70, p_minutes)
    else p_minutes
  end
$$;
revoke all on function private.estama_effective_course_minutes(text, integer) from public, anon, authenticated;

-- Trigger-only: reads private customer history without exposing it through an RPC.
create or replace function private.enforce_new_customer_course_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  if new.status = 'cancelled' then return new; end if;
  if tg_op = 'UPDATE' then
    if (new.cast_id, new.store_id, new.customer_phone, new.duration, new.reservation_date, new.start_time)
       is not distinct from
       (old.cast_id, old.store_id, old.customer_phone, old.duration, old.reservation_date, old.start_time)
       and old.status <> 'cancelled' then
      return new;
    end if;
  end if;
  select c.new_customer_max_minutes into v_max from public.casts c
  where c.id = new.cast_id and c.store_id = new.store_id;
  if v_max is not null and new.duration > v_max
     and not public.has_completed_visit(new.customer_phone, new.store_id, new.id,
       least(new.reservation_date + coalesce(new.start_time, time '00:00'), timezone('Asia/Tokyo', now()))) then
    raise check_violation using
      message = '初めて当店をご利用のお客様は、このセラピストのコースは' || v_max || '分までです。コースを選び直してください。',
      detail = 'NEW_CUSTOMER_COURSE_LIMIT', constraint = 'new_customer_course_limit';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_new_customer_course_limit() from public, anon, authenticated;
create trigger trg_validate_new_customer_course_limit
before insert or update of cast_id, store_id, customer_phone, duration, reservation_date, start_time, status
on public.reservations for each row execute function private.enforce_new_customer_course_limit();
comment on column public.casts.new_customer_max_minutes is
  '当店で施術済み履歴がないお客様のコース上限。予約の新規登録・条件変更時に超過を拒否。エステ魂の申込自体は媒体側で受け付けるため要確認で保持。';

CREATE OR REPLACE FUNCTION private.check_estama_request(r estama_reservation_requests)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- エステ魂の表示110分／施術100分などを、予約枠の長さで検査する。
  r.course_minutes := private.estama_effective_course_minutes(r.course_label, r.course_minutes);
  v_end := v_start + coalesce(r.course_minutes, 60);
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

  -- 上限を最優先で表示。媒体の自己申告ではなく同じ店舗の施術済み履歴で判定。
  if v_cast.new_customer_max_minutes is not null
     and coalesce(r.course_minutes, 0) > v_cast.new_customer_max_minutes
     and not public.has_completed_visit(r.customer_phone, r.store_id, r.reservation_id, least(r.hope_date + r.hope_time, timezone('Asia/Tokyo', now()))) then
    return jsonb_build_object('castId', v_cast.id, 'status', 'course_limit',
      'note', v_cast.name || 'さんは新規のお客様は' || v_cast.new_customer_max_minutes || '分まで（' || r.course_minutes || '分で予約されています）');
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
$function$
;

-- Patch the live auto-registration function without replacing unrelated pricing/room fixes.
-- Older databases without auto registration still get the reservation boundary guard.
do $patch$
declare
  v_oid regprocedure := to_regprocedure('private.try_auto_register_estama_request(uuid)');
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_oid is null then return; end if;
  v_definition := pg_get_functiondef(v_oid);
  v_old := '  v_check := private.check_estama_request(r);';
  v_new := E'  r.course_minutes := greatest(r.course_minutes, v_course_duration);\n  v_check := private.check_estama_request(r);';
  if position(v_old in v_definition) = 0 then raise exception 'Auto booking course check changed: review migration'; end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := '        and not coalesce(c.is_estama_dummy, false)';
  v_new := $replacement$        and not coalesce(c.is_estama_dummy, false)
        and (c.new_customer_max_minutes is null
          or v_course_duration <= c.new_customer_max_minutes
          or public.has_completed_visit(r.customer_phone, r.store_id, null,
            least(r.hope_date + r.hope_time, timezone('Asia/Tokyo', now()))))$replacement$;
  if position(v_old in v_definition) = 0 then raise exception 'Auto booking free assignment changed: review migration'; end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$patch$;
