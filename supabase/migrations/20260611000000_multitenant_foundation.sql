-- ========== マルチテナント化（適用済み: 2026-06-11 MCP経由） ==========
-- Step1: stores / user_stores / 基盤関数

create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- サブドメイン（例: main → main.zenryoku-app.com）
  name        text not null,
  logo_url    text,
  theme_color text,                          -- HSL値（shadcn --primary 用）
  settings    jsonb not null default '{}'::jsonb,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.stores enable row level security;

create policy "stores_public_read" on public.stores
  for select to anon, authenticated using (is_active = true);

insert into public.stores (id, slug, name, is_default)
values (
  '00000000-0000-0000-0000-000000000001',
  'main',
  coalesce((select shop_name from public.shop_settings limit 1), 'メイン店舗'),
  true
)
on conflict (id) do nothing;

create table if not exists public.user_stores (
  user_id    uuid not null,
  store_id   uuid not null references public.stores(id) on delete cascade,
  role       text not null default 'staff',  -- owner | manager | staff
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

alter table public.user_stores enable row level security;

create policy "user_stores_read_own" on public.user_stores
  for select to authenticated using (user_id = auth.uid());

create or replace function public.current_store_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select store_id from public.user_stores where user_id = auth.uid()
$$;

insert into public.user_stores (user_id, store_id, role)
select id, '00000000-0000-0000-0000-000000000001', 'owner'
from auth.users
on conflict do nothing;

create or replace function public.set_store_id()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_count int;
begin
  if auth.uid() is not null
     and (new.store_id is null or new.store_id = '00000000-0000-0000-0000-000000000001') then
    select count(*), min(store_id::text)::uuid into v_count, v_store
    from public.user_stores where user_id = auth.uid();
    if v_count = 1 then
      new.store_id := v_store;
    end if;
  end if;
  if new.store_id is null then
    new.store_id := '00000000-0000-0000-0000-000000000001';
  end if;
  return new;
end;
$$;

-- Step2: 全テーブルに store_id / トリガー / RESTRICTIVE分離ポリシー
-- 既存の許可ポリシーは温存し、RESTRICTIVE をANDで重ねる。
-- anon（公開サイト・セラピストポータル）は対象外なので壊れない。

do $$
declare
  t text;
  tables text[] := array[
    'advertising_costs','back_rates','banners','board_posts',
    'business_bank_accounts','business_contracts','business_fixed_costs',
    'business_flows','business_logins','business_vendors',
    'cast_access_tokens','cast_messages','cast_posts','cast_reviews',
    'cast_site_credentials','cast_training_records','casts',
    'cleaning_checklists','closings','customers','daily_clearances',
    'daily_feedback','daily_sales_records','deductions','discounts',
    'expense_rates','expenses','facility_contracts','facility_equipment',
    'hp_analytics_daily','hp_analytics_hourly','hp_analytics_pages',
    'hp_analytics_traffic','hp_articles','knowledge_articles',
    'knowledge_documents','monthly_reports','monthly_sales_targets',
    'nomination_rates','option_rates','password_entries','payment_reminders',
    'payment_settings','referral_rewards','reservations','room_costumes',
    'room_equipment','room_supplies','rooms','shifts','shop_settings',
    'site_content','sns_accounts','text_templates',
    'therapist_clearance_reports','therapist_profiles',
    'therapist_transport_expenses','training_modules'
  ];
begin
  foreach t in array tables loop
    execute format(
      'alter table public.%I add column if not exists store_id uuid not null
       default ''00000000-0000-0000-0000-000000000001''::uuid
       references public.stores(id)', t);

    execute format('create index if not exists idx_%s_store_id on public.%I(store_id)', t, t);

    execute format('drop trigger if exists trg_set_store_id on public.%I', t);
    execute format(
      'create trigger trg_set_store_id before insert on public.%I
       for each row execute function public.set_store_id()', t);

    execute format('drop policy if exists "store_isolation" on public.%I', t);
    execute format(
      'create policy "store_isolation" on public.%I
       as restrictive for all to authenticated
       using (store_id in (select public.current_store_ids()))
       with check (store_id in (select public.current_store_ids()))', t);
  end loop;
end $$;

-- Step3: PK複合化 + 月次集計の店舗対応

alter table public.site_content drop constraint site_content_pkey;
alter table public.site_content add constraint site_content_pkey primary key (store_id, key);

alter table public.monthly_reports drop constraint monthly_reports_pkey;
alter table public.monthly_reports add constraint monthly_reports_pkey primary key (store_id, month_date);

create or replace function public.refresh_monthly_report(p_store uuid, p_month date)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  v_revenue   bigint;
  v_sessions  int;
  v_customers int;
begin
  select coalesce(sum(price), 0), count(*), count(distinct customer_phone)
  into v_revenue, v_sessions, v_customers
  from reservations
  where store_id = p_store
    and reservation_date >= p_month
    and reservation_date < (p_month + interval '1 month')
    and status = 'completed';

  insert into monthly_reports (store_id, month_date, revenue, session_count, customer_count, updated_at)
  values (p_store, p_month, v_revenue, v_sessions, v_customers, now())
  on conflict (store_id, month_date) do update
    set revenue        = excluded.revenue,
        session_count  = excluded.session_count,
        customer_count = excluded.customer_count,
        updated_at     = now();
end;
$$;

create or replace function public.refresh_monthly_report(p_month date)
returns void language sql security definer
set search_path = public
as $$
  select public.refresh_monthly_report('00000000-0000-0000-0000-000000000001'::uuid, p_month)
$$;

create or replace function public.trg_refresh_monthly_report()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_monthly_report(old.store_id, date_trunc('month', old.reservation_date)::date);
  elsif tg_op = 'INSERT' then
    perform public.refresh_monthly_report(new.store_id, date_trunc('month', new.reservation_date)::date);
  else
    perform public.refresh_monthly_report(new.store_id, date_trunc('month', new.reservation_date)::date);
    if date_trunc('month', old.reservation_date) != date_trunc('month', new.reservation_date)
       or old.store_id != new.store_id then
      perform public.refresh_monthly_report(old.store_id, date_trunc('month', old.reservation_date)::date);
    end if;
  end if;
  return null;
end;
$$;
