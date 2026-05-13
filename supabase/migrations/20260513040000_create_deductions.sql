create table if not exists public.deductions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  deduction_type text not null check (deduction_type in ('fixed', 'percentage')),
  amount        numeric not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.deductions enable row level security;
create policy "Authenticated read deductions" on public.deductions for select to authenticated using (true);
create policy "Authenticated manage deductions" on public.deductions for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';
