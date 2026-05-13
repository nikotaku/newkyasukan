-- HP daily access
create table if not exists public.hp_analytics_daily (
  date            date primary key,
  visits          integer not null default 0,
  unique_visitors integer not null default 0,
  page_views      integer not null default 0,
  updated_at      timestamptz not null default now()
);
alter table public.hp_analytics_daily enable row level security;
create policy "hp_analytics_daily select" on public.hp_analytics_daily for select to authenticated using (true);
create policy "hp_analytics_daily insert" on public.hp_analytics_daily for insert with check (true);
create policy "hp_analytics_daily update" on public.hp_analytics_daily for update using (true);

-- HP page-level access
create table if not exists public.hp_analytics_pages (
  date      date   not null,
  page_path text   not null,
  views     integer not null default 0,
  primary key (date, page_path)
);
alter table public.hp_analytics_pages enable row level security;
create policy "hp_analytics_pages select" on public.hp_analytics_pages for select to authenticated using (true);
create policy "hp_analytics_pages insert" on public.hp_analytics_pages for insert with check (true);
create policy "hp_analytics_pages update" on public.hp_analytics_pages for update using (true);

-- HP hourly access
create table if not exists public.hp_analytics_hourly (
  date  date    not null,
  hour  integer not null check (hour between 0 and 23),
  visits integer not null default 0,
  primary key (date, hour)
);
alter table public.hp_analytics_hourly enable row level security;
create policy "hp_analytics_hourly select" on public.hp_analytics_hourly for select to authenticated using (true);
create policy "hp_analytics_hourly insert" on public.hp_analytics_hourly for insert with check (true);
create policy "hp_analytics_hourly update" on public.hp_analytics_hourly for update using (true);

-- HP traffic sources
create table if not exists public.hp_analytics_traffic (
  date   date not null,
  source text not null,
  visits integer not null default 0,
  primary key (date, source)
);
alter table public.hp_analytics_traffic enable row level security;
create policy "hp_analytics_traffic select" on public.hp_analytics_traffic for select to authenticated using (true);
create policy "hp_analytics_traffic insert" on public.hp_analytics_traffic for insert with check (true);
create policy "hp_analytics_traffic update" on public.hp_analytics_traffic for update using (true);

-- RPC: record a page view (called from public frontend, no auth required)
create or replace function public.record_page_view(p_path text)
returns void language plpgsql security definer as $$
declare
  today date := current_date;
  hr    integer := extract(hour from now() at time zone 'Asia/Tokyo');
  src   text;
begin
  -- daily
  insert into public.hp_analytics_daily (date, visits, unique_visitors, page_views)
  values (today, 1, 1, 1)
  on conflict (date) do update set
    page_views = hp_analytics_daily.page_views + 1,
    visits     = hp_analytics_daily.visits + 1,
    updated_at = now();

  -- page
  insert into public.hp_analytics_pages (date, page_path, views)
  values (today, p_path, 1)
  on conflict (date, page_path) do update set
    views = hp_analytics_pages.views + 1;

  -- hourly
  insert into public.hp_analytics_hourly (date, hour, visits)
  values (today, hr, 1)
  on conflict (date, hour) do update set
    visits = hp_analytics_hourly.visits + 1;
end;
$$;

grant execute on function public.record_page_view(text) to anon, authenticated;

-- Monthly sales targets table (used by SalesMonthlySalesTarget page)
create table if not exists public.monthly_sales_targets (
  month_date date primary key,
  target_revenue bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.monthly_sales_targets enable row level security;
create policy "monthly_sales_targets all" on public.monthly_sales_targets for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
