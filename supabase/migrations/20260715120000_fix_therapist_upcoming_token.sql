-- get_therapist_upcoming_reservations が空の cast_access_tokens を参照していて
-- 常に invalid token になっていたのを、他のRPCと同じ casts.access_token 方式に修正。
-- 併せて本日のタイムライン表示用に completed も返す。

create or replace function public.get_therapist_upcoming_reservations(p_token text)
returns table(
  id uuid, reservation_date text, start_time text, duration integer,
  course_name text, room text, options text[], nomination_type text,
  customer_name text, status text
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_cast_id uuid;
  v_today date;
begin
  select c.id into v_cast_id from casts c where c.access_token = p_token;
  if v_cast_id is null then raise exception 'invalid token'; end if;

  -- 日本時間の今日以降（深夜分も含めるため当日を含む）
  v_today := (now() at time zone 'Asia/Tokyo')::date;

  return query
  select
    r.id,
    r.reservation_date::text,
    left(r.start_time::text, 5),
    r.duration,
    r.course_name,
    r.room,
    r.options,
    r.nomination_type,
    r.customer_name,
    r.status
  from reservations r
  where r.cast_id = v_cast_id
    and r.reservation_date >= v_today
    and r.status in ('confirmed', 'completed')
  order by r.reservation_date, r.start_time
  limit 100;
end;
$$;
