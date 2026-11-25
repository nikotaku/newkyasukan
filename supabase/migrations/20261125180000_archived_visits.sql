create or replace function public.enka_archived_visits(p_phone text)
returns table(visit_date date, course text, therapist text)
language sql stable security definer set search_path = '' as $$
 select r.reservation_date::date, r.course_name::text, c.name::text
 from public.reservations r
 left join public.casts c on c.id=r.cast_id and c.store_id=r.store_id
 where exists (select 1 from public.user_stores u where u.user_id=auth.uid()
   and u.store_id='404499ab-5350-490f-9608-5814faffda6f' and u.role in ('owner','manager'))
 and r.store_id='00000000-0000-0000-0000-000000000001'
 and r.status='completed' and length(public.norm_phone(p_phone)) between 10 and 11
 and public.norm_phone(r.customer_phone)=public.norm_phone(p_phone)
 order by r.reservation_date desc,r.start_time desc
$$;
revoke all on function public.enka_archived_visits(text) from public,anon;
grant execute on function public.enka_archived_visits(text) to authenticated;
