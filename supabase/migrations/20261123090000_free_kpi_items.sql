-- KPI管理（売上ダッシュボードの「KPI管理」タブ、src/pages/HpKpiGoals.tsx）を、決まった日次・週次・月次の3つから
-- 自由に足せる形にする。KPIごとに 内容・頻度（日・週・月）・目標回数 を持ち、実施数は期間（その日・週・月の初日）ごとに数える。
-- 以前の hp_kpi_goals / hp_kpi_progress は残し、中身を新しい表へ写す。

create table if not exists public.hp_kpi_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  target_count integer not null default 1 check (target_count between 1 and 999),
  note text check (note is null or char_length(note) <= 300),
  display_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hp_kpi_item_progress (
  item_id uuid not null references public.hp_kpi_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  period_start date not null,
  completed_count integer not null default 0 check (completed_count between 0 and 999),
  updated_at timestamptz not null default now(),
  primary key (item_id, period_start)
);

create index if not exists hp_kpi_items_store_idx on public.hp_kpi_items (store_id, display_order);

alter table public.hp_kpi_items enable row level security;
alter table public.hp_kpi_item_progress enable row level security;
revoke all on public.hp_kpi_items, public.hp_kpi_item_progress from anon;
grant select, insert, update, delete on public.hp_kpi_items, public.hp_kpi_item_progress to authenticated;

create policy hp_kpi_items_store on public.hp_kpi_items for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));
create policy hp_kpi_item_progress_store on public.hp_kpi_item_progress for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

-- 以前の日次・週次・月次のKPIと実施数を写す（1回だけ）
insert into public.hp_kpi_items (store_id, title, cadence, target_count, display_order, created_at)
select g.store_id, g.title, g.cadence, g.target_count,
  case g.cadence when 'daily' then 10 when 'weekly' then 20 else 30 end, g.created_at
from public.hp_kpi_goals g
where not exists (select 1 from public.hp_kpi_items i where i.store_id = g.store_id);

insert into public.hp_kpi_item_progress (item_id, store_id, period_start, completed_count)
select i.id, p.store_id, p.period_start, p.completed_count
from public.hp_kpi_progress p
join public.hp_kpi_items i on i.store_id = p.store_id and i.cadence = p.cadence
on conflict do nothing;
