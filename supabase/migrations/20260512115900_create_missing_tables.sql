-- Create facility_contracts table (was created outside of migrations in production)
-- IF NOT EXISTS is safe: no-op if table already exists in production
create table if not exists public.facility_contracts (
  id              uuid primary key default gen_random_uuid(),
  contract_type   text not null default 'other',
  name            text not null,
  amount          integer not null default 0,
  start_date      date,
  end_date        date,
  notes           text,
  contract_status text,
  management_company text,
  address         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.facility_contracts enable row level security;

drop policy if exists "facility_contracts select" on public.facility_contracts;
drop policy if exists "facility_contracts insert" on public.facility_contracts;
drop policy if exists "facility_contracts update" on public.facility_contracts;
drop policy if exists "facility_contracts delete" on public.facility_contracts;
create policy "facility_contracts select" on public.facility_contracts
  for select to authenticated using (true);
create policy "facility_contracts insert" on public.facility_contracts
  for insert to authenticated with check (true);
create policy "facility_contracts update" on public.facility_contracts
  for update to authenticated using (true);
create policy "facility_contracts delete" on public.facility_contracts
  for delete to authenticated using (true);

-- Create advertising_costs table (was created outside of migrations in production)
create table if not exists public.advertising_costs (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  platform    text not null,
  cost        integer not null default 0,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  conversions integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (date, platform)
);

alter table public.advertising_costs enable row level security;

drop policy if exists "advertising_costs select" on public.advertising_costs;
drop policy if exists "advertising_costs insert" on public.advertising_costs;
drop policy if exists "advertising_costs update" on public.advertising_costs;
drop policy if exists "advertising_costs delete" on public.advertising_costs;
create policy "advertising_costs select" on public.advertising_costs
  for select to authenticated using (true);
create policy "advertising_costs insert" on public.advertising_costs
  for insert to authenticated with check (true);
create policy "advertising_costs update" on public.advertising_costs
  for update to authenticated using (true);
create policy "advertising_costs delete" on public.advertising_costs
  for delete to authenticated using (true);

notify pgrst, 'reload schema';
