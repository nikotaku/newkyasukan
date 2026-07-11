-- セラピストポータルの顧客カルテで「接客した日」を毎回表示できるように、
-- get_therapist_customers に my_visit_dates（担当した来店日の配列）を追加する。

drop function if exists public.get_therapist_customers(text);

create or replace function public.get_therapist_customers(p_token text)
returns table(
  customer_id uuid, name text, phone text,
  visit_count integer, total_spent bigint, last_visited date,
  tags text[], notes text,
  preferred_pressure text, concern_areas text[], conversation_level text,
  ng_items text, preference_notes text,
  my_visit_count bigint, my_last_visit date, my_visit_dates date[]
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_cast_id uuid;
  v_store uuid;
begin
  if p_token is null or length(p_token) < 8 then
    raise exception 'invalid token';
  end if;

  select c.id, c.store_id into v_cast_id, v_store
  from casts c where c.access_token = p_token;

  if v_cast_id is null then
    raise exception 'cast not found';
  end if;

  return query
  with mine as (
    select norm_phone(r.customer_phone) as np,
           count(*) as cnt,
           max(r.reservation_date) as last_d,
           array_agg(distinct r.reservation_date order by r.reservation_date desc) as dates
    from reservations r
    where r.cast_id = v_cast_id and r.status = 'completed'
      and length(norm_phone(r.customer_phone)) >= 10
    group by norm_phone(r.customer_phone)
  )
  select cu.id, cu.name, cu.phone,
         cu.visit_count, cu.total_spent, cu.last_visited,
         cu.tags, cu.notes,
         cp.preferred_pressure, cp.concern_areas, cp.conversation_level,
         cp.ng_items, cp.preference_notes,
         m.cnt, m.last_d, m.dates
  from mine m
  join customers cu on cu.store_id = v_store and norm_phone(cu.phone) = m.np
  left join customer_profiles cp on cp.customer_id = cu.id
  order by m.last_d desc;
end
$$;
