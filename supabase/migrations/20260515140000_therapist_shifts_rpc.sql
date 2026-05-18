-- Therapist shift viewing RPC
create or replace function public.get_therapist_shifts(
  p_token text,
  p_year  int,
  p_month int
)
returns table (
  id          uuid,
  shift_date  date,
  start_time  time,
  end_time    time,
  room        text,
  notes       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast_id uuid;
  v_start   date;
  v_end     date;
begin
  if p_token is null or length(p_token) < 8 then
    raise exception 'invalid token';
  end if;

  select c.id into v_cast_id
  from casts c where c.access_token = p_token;

  if v_cast_id is null then
    raise exception 'cast not found';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month')::date;

  return query
  select s.id, s.shift_date, s.start_time, s.end_time, s.room, s.notes
  from shifts s
  where s.cast_id = v_cast_id
    and s.shift_date >= v_start
    and s.shift_date < v_end
  order by s.shift_date, s.start_time;
end $$;

grant execute on function public.get_therapist_shifts(text, int, int) to anon, authenticated;
