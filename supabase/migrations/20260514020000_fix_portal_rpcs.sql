-- =====================================================
-- 1. Transport expenses table
-- =====================================================
create table if not exists public.therapist_transport_expenses (
  id           uuid primary key default gen_random_uuid(),
  cast_id      uuid not null references public.casts(id) on delete cascade,
  expense_date date not null,
  amount       integer not null,
  route        text,
  notes        text,
  status       text not null default 'pending',
  created_at   timestamptz not null default now()
);

alter table public.therapist_transport_expenses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'therapist_transport_expenses'
      and policyname = 'Authenticated users can manage transport expenses'
  ) then
    create policy "Authenticated users can manage transport expenses"
      on public.therapist_transport_expenses for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- =====================================================
-- 2. RPC: monthly settlements (uses casts.access_token)
-- =====================================================
create or replace function public.get_therapist_monthly_settlements(
  p_token text,
  p_year  int,
  p_month int
)
returns table (
  id               uuid,
  reservation_date text,
  start_time       text,
  duration         int,
  course_name      text,
  customer_price   int,
  therapist_back   int,
  status           text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_cast_id uuid;
begin
  select id into v_cast_id
  from casts where access_token = p_token;
  if v_cast_id is null then raise exception 'invalid token'; end if;

  return query
  select
    r.id,
    r.reservation_date::text,
    left(r.start_time, 5),
    r.duration,
    r.course_name,
    r.price,
    coalesce(br.therapist_back, 0)
    + coalesce((
        select sum(opr.therapist_back)
        from unnest(r.options) as opt(name)
        join option_rates opr on opr.option_name = opt.name
        where opr.therapist_back is not null
      ), 0)::int
    + coalesce((
        select nr.therapist_back
        from nomination_rates nr
        where nr.nomination_type = r.nomination_type
          and nr.therapist_back is not null
        limit 1
      ), 0)::int,
    r.status
  from reservations r
  left join back_rates br
    on br.course_type = r.course_type and br.duration = r.duration
  where r.cast_id = v_cast_id
    and extract(year  from r.reservation_date::date) = p_year
    and extract(month from r.reservation_date::date) = p_month
    and r.status <> 'cancelled'
  order by r.reservation_date, r.start_time;
end;
$$;

grant execute on function public.get_therapist_monthly_settlements(text, int, int) to anon, authenticated;

-- =====================================================
-- 3. RPC: submit transport expense
-- =====================================================
create or replace function public.submit_therapist_transport_expense(
  p_token  text,
  p_date   date,
  p_amount integer,
  p_route  text,
  p_notes  text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cast_id uuid;
  v_id      uuid;
begin
  select id into v_cast_id
  from casts where access_token = p_token;
  if v_cast_id is null then raise exception 'invalid token'; end if;

  insert into therapist_transport_expenses (cast_id, expense_date, amount, route, notes)
  values (v_cast_id, p_date, p_amount, p_route, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_therapist_transport_expense(text, date, integer, text, text) to anon, authenticated;

-- =====================================================
-- 4. RPC: list transport expenses
-- =====================================================
create or replace function public.get_therapist_transport_expenses(
  p_token text,
  p_year  int,
  p_month int
)
returns table (
  id           uuid,
  expense_date text,
  amount       int,
  route        text,
  notes        text,
  status       text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_cast_id uuid;
begin
  select id into v_cast_id
  from casts where access_token = p_token;
  if v_cast_id is null then raise exception 'invalid token'; end if;

  return query
  select e.id, e.expense_date::text, e.amount, e.route, e.notes, e.status
  from therapist_transport_expenses e
  where e.cast_id = v_cast_id
    and extract(year  from e.expense_date) = p_year
    and extract(month from e.expense_date) = p_month
  order by e.expense_date desc;
end;
$$;

grant execute on function public.get_therapist_transport_expenses(text, int, int) to anon, authenticated;

-- =====================================================
-- 5. DR options up to 50分
-- =====================================================
insert into option_rates (option_name, customer_price, therapist_back)
values
  ('DR20分', 2000, 1000),
  ('DR30分', 3000, 1500),
  ('DR40分', 4000, 2000),
  ('DR50分', 5000, 2500)
on conflict (option_name) do nothing;

notify pgrst, 'reload schema';
