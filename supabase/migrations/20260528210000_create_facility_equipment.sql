-- 設備管理（消耗品・衣装・家具家電）テーブル
-- custom_fields でプロパティを自由に追加できる
create table if not exists public.facility_equipment (
  id uuid primary key default gen_random_uuid(),
  item_type text not null default 'consumables',
  name text not null,
  quantity integer not null default 1,
  unit text default '個',
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facility_equipment enable row level security;

create policy "facility_equipment_select"
on public.facility_equipment for select
using (true);

create policy "facility_equipment_admin"
on public.facility_equipment for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
