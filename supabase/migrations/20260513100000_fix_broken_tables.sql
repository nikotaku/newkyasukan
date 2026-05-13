-- 1. Add missing columns to rooms table (used by FacilitiesRooms page)
alter table public.rooms
  add column if not exists room_type  text not null default 'インルーム',
  add column if not exists floor      text,
  add column if not exists entry_flow text,
  add column if not exists rules      text,
  add column if not exists key_info   text;

-- 2. Create allowances table (used by SystemAllowances page)
create table if not exists public.allowances (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  allowance_type text not null default 'fixed' check (allowance_type in ('fixed', 'percentage')),
  amount         numeric not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.allowances enable row level security;
drop policy if exists "allowances select" on public.allowances;
drop policy if exists "allowances insert" on public.allowances;
drop policy if exists "allowances update" on public.allowances;
drop policy if exists "allowances delete" on public.allowances;
create policy "allowances select" on public.allowances for select to authenticated using (true);
create policy "allowances insert" on public.allowances for insert to authenticated with check (true);
create policy "allowances update" on public.allowances for update to authenticated using (true);
create policy "allowances delete" on public.allowances for delete to authenticated using (true);

-- 3. Fix casts.status CHECK constraint to allow Japanese status values
alter table public.casts drop constraint if exists casts_status_check;
alter table public.casts add constraint casts_status_check
  check (status in ('waiting', 'busy', 'offline', '派遣中', 'リピート予定', '残タスク', '未着手'));

-- 4. Fix monthly_sales_targets to support year/month/target_amount columns
--    The page expects: id, year, month, target_amount, actual_amount
--    The table currently has: month_date (PK), target_revenue
--    We add computed columns and keep backward compat by renaming target_revenue as alias
alter table public.monthly_sales_targets
  add column if not exists target_amount bigint;

-- Sync existing target_revenue → target_amount
update public.monthly_sales_targets
  set target_amount = target_revenue
  where target_amount is null;

notify pgrst, 'reload schema';
