alter table public.daily_clearances
  add column if not exists draft_saved_at timestamptz;

create or replace function public.partial_update_daily_clearance(
  p_cast_id uuid,
  p_date date,
  p_total_sales integer default null,
  p_therapist_back integer default null,
  p_misc_expenses integer default null,
  p_accommodation_fee integer default null,
  p_transportation_fee integer default null,
  p_other_expenses jsonb default null,
  p_payout_method text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select c.store_id into v_store_id
  from public.casts c
  where c.id = p_cast_id;

  if v_store_id is null or not public.can_manage_store(v_store_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_date is null
     or coalesce(p_total_sales, 0) < 0
     or coalesce(p_therapist_back, 0) < 0
     or coalesce(p_misc_expenses, 0) < 0
     or coalesce(p_accommodation_fee, 0) < 0
     or coalesce(p_transportation_fee, 0) < 0 then
    raise exception 'invalid clearance amount' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_cast_id::text || ':' || p_date::text, 0)
  );

  if exists (
    select 1 from public.daily_clearances d
    where d.cast_id = p_cast_id and d.date = p_date and d.cleared_at is not null
  ) then
    raise exception 'completed clearance cannot be saved as draft' using errcode = 'P0002';
  end if;

  insert into public.daily_clearances (
    cast_id, date, total_sales, therapist_back, misc_expenses,
    accommodation_fee, transportation_fee, other_expenses, payout_method,
    status, points_awarded, store_id, draft_saved_at
  ) values (
    p_cast_id, p_date, coalesce(p_total_sales, 0), coalesce(p_therapist_back, 0),
    coalesce(p_misc_expenses, 0), coalesce(p_accommodation_fee, 0),
    coalesce(p_transportation_fee, 0), coalesce(p_other_expenses, '[]'::jsonb),
    nullif(trim(coalesce(p_payout_method, '')), ''), 'draft', 0, v_store_id, now()
  )
  on conflict (cast_id, date) do update
  set total_sales = excluded.total_sales,
      therapist_back = excluded.therapist_back,
      misc_expenses = excluded.misc_expenses,
      accommodation_fee = excluded.accommodation_fee,
      transportation_fee = excluded.transportation_fee,
      other_expenses = excluded.other_expenses,
      payout_method = excluded.payout_method,
      store_id = excluded.store_id,
      draft_saved_at = now();
end;
$$;

revoke all on function public.partial_update_daily_clearance(
  uuid, date, integer, integer, integer, integer, integer, jsonb, text
) from public, anon;
grant execute on function public.partial_update_daily_clearance(
  uuid, date, integer, integer, integer, integer, integer, jsonb, text
) to authenticated;
