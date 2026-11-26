-- 教育の「ゴール」タブ（/education?tab=goals、src/components/education/CastGoalsBoard.tsx）。
-- 在籍・出稼ぎのリピートのセラピストごとに、最終的なゴール（文章）と、1か月の売上・本数・本指名率の目標を持つ。
-- 実績は予約（reservations の完了）から画面で数える。管理画面だけで使う（anon は読めない）。

create table if not exists public.cast_goals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  goal_text text check (goal_text is null or char_length(goal_text) <= 2000),
  monthly_sales_target integer check (monthly_sales_target is null or monthly_sales_target between 0 and 100000000),
  monthly_count_target integer check (monthly_count_target is null or monthly_count_target between 0 and 1000),
  honshimei_rate_target numeric(4, 1) check (honshimei_rate_target is null or honshimei_rate_target between 0 and 100),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cast_id)
);

create index if not exists cast_goals_store_idx on public.cast_goals (store_id);

alter table public.cast_goals enable row level security;
revoke all on public.cast_goals from anon;
grant select, insert, update, delete on public.cast_goals to authenticated;

create policy cast_goals_store on public.cast_goals for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));
