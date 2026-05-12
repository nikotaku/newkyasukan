create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kana        text,
  phone       text not null,
  email       text,
  visit_count integer,
  status      text not null default 'active',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Authenticated users can read customers"
  on public.customers for select
  to authenticated using (true);

create policy "Authenticated users can insert customers"
  on public.customers for insert
  to authenticated with check (true);

create policy "Authenticated users can update customers"
  on public.customers for update
  to authenticated using (true);

create policy "Authenticated users can delete customers"
  on public.customers for delete
  to authenticated using (true);
