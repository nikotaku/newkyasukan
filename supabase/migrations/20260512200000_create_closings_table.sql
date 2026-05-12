create table if not exists public.closings (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('daily', 'monthly')),
  period_date date not null,
  total_sales integer not null default 0,
  total_reservations integer not null default 0,
  notes text,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (period_type, period_date)
);

alter table public.closings enable row level security;
create policy "Authenticated users can manage closings"
  on public.closings for all
  to authenticated using (true) with check (true);
