-- Store-scoped website-growth KPIs.
-- One configurable KPI per cadence (daily / weekly / monthly), with a separate
-- progress record for every reporting period so achievement can be calculated.

create table if not exists public.hp_kpi_goals (
  store_id uuid not null references public.stores(id) on delete cascade,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  target_count integer not null default 1 check (target_count >= 1 and target_count <= 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hp_kpi_goals_pkey primary key (store_id, cadence)
);

create table if not exists public.hp_kpi_progress (
  store_id uuid not null references public.stores(id) on delete cascade,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  completed_count integer not null default 0 check (completed_count >= 0 and completed_count <= 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hp_kpi_progress_pkey primary key (store_id, cadence, period_start)
);

create index if not exists hp_kpi_progress_store_period_idx
  on public.hp_kpi_progress (store_id, period_start desc);

alter table public.hp_kpi_goals enable row level security;
alter table public.hp_kpi_progress enable row level security;

grant select, insert, update, delete on table public.hp_kpi_goals to authenticated;
grant select, insert, update, delete on table public.hp_kpi_progress to authenticated;
grant select, insert, update, delete on table public.hp_kpi_goals to service_role;
grant select, insert, update, delete on table public.hp_kpi_progress to service_role;
revoke all on table public.hp_kpi_goals from anon;
revoke all on table public.hp_kpi_progress from anon;

drop policy if exists "hp_kpi_goals store access" on public.hp_kpi_goals;
create policy "hp_kpi_goals store access"
on public.hp_kpi_goals
for all
to authenticated
using (store_id in (select public.current_store_ids()))
with check (store_id in (select public.current_store_ids()));

drop policy if exists "hp_kpi_progress store access" on public.hp_kpi_progress;
create policy "hp_kpi_progress store access"
on public.hp_kpi_progress
for all
to authenticated
using (store_id in (select public.current_store_ids()))
with check (store_id in (select public.current_store_ids()));

drop trigger if exists update_hp_kpi_goals_updated_at on public.hp_kpi_goals;
create trigger update_hp_kpi_goals_updated_at
before update on public.hp_kpi_goals
for each row execute function public.update_updated_at_column();

drop trigger if exists update_hp_kpi_progress_updated_at on public.hp_kpi_progress;
create trigger update_hp_kpi_progress_updated_at
before update on public.hp_kpi_progress
for each row execute function public.update_updated_at_column();
