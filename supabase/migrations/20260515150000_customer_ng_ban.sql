-- Add ban fields to customers
alter table public.customers
  add column if not exists is_banned boolean default false,
  add column if not exists ban_reason text;

-- Customer NG casts junction table
create table if not exists public.customer_ng_casts (
  id         uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  cast_id    uuid not null references public.casts(id) on delete cascade,
  reason     text,
  created_at timestamptz default now(),
  unique(customer_id, cast_id)
);
