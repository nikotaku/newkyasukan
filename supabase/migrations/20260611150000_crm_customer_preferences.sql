-- ========== CRM: 顧客の好み・営業管理（適用済み: 2026-06-11 MCP経由） ==========

-- 0. 電話番号正規化ヘルパー
create or replace function public.norm_phone(p text)
returns text language sql immutable
as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- 1. ドリフト修正: customer_ng_ban（リポジトリにあるが本番未適用だったため適用）
alter table public.customers
  add column if not exists is_banned boolean default false,
  add column if not exists ban_reason text,
  add column if not exists tags text[],
  add column if not exists total_spent bigint not null default 0,
  add column if not exists last_visited date,
  add column if not exists last_cast_id uuid references public.casts(id);

create table if not exists public.customer_ng_casts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  reason text,
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.stores(id),
  created_at timestamptz default now(),
  unique(customer_id, cast_id)
);

-- 2. 顧客の好みプロフィール
create table if not exists public.customer_profiles (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.stores(id),
  preferred_pressure text,
  concern_areas text[],
  conversation_level text,
  ng_items text,
  preference_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. 営業フォロー履歴
create table if not exists public.customer_followups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.stores(id),
  followup_date date not null default current_date,
  method text,
  content text,
  next_action_date date,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_followups_customer on public.customer_followups(customer_id);

-- RLS: 既存テーブルと同じパターン（authenticated 全許可 + store_isolation RESTRICTIVE + set_store_id）
do $$
declare t text;
begin
  foreach t in array array['customer_ng_casts','customer_profiles','customer_followups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "auth all" on public.%I', t);
    execute format('create policy "auth all" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('create index if not exists idx_%s_store_id on public.%I(store_id)', t, t);
    execute format('drop trigger if exists trg_set_store_id on public.%I', t);
    execute format('create trigger trg_set_store_id before insert on public.%I for each row execute function public.set_store_id()', t);
    execute format('drop policy if exists "store_isolation" on public.%I', t);
    execute format('create policy "store_isolation" on public.%I as restrictive for all to authenticated using (store_id in (select public.current_store_ids())) with check (store_id in (select public.current_store_ids()))', t);
  end loop;
end $$;

-- 4. 予約から顧客統計（来店回数・累計・最終来店・前回担当）を自動同期
create or replace function public.sync_customer_stats_for(p_store uuid, p_phone_raw text, p_name text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_phone text := norm_phone(p_phone_raw);
  v_customer uuid;
  v_visits int;
  v_spent bigint;
  v_last date;
  v_last_cast uuid;
begin
  if length(v_phone) < 10 then return; end if;

  select count(*), coalesce(sum(price), 0), max(reservation_date)
  into v_visits, v_spent, v_last
  from reservations
  where store_id = p_store and norm_phone(customer_phone) = v_phone and status = 'completed';

  select cast_id into v_last_cast
  from reservations
  where store_id = p_store and norm_phone(customer_phone) = v_phone
    and status = 'completed' and cast_id is not null
  order by reservation_date desc, start_time desc
  limit 1;

  select id into v_customer
  from customers
  where store_id = p_store and norm_phone(phone) = v_phone
  limit 1;

  if v_customer is null then
    if v_visits = 0 then return; end if;
    insert into customers (name, phone, store_id, visit_count, total_spent, last_visited, last_cast_id)
    values (coalesce(nullif(p_name, ''), '不明'), p_phone_raw, p_store, v_visits, v_spent, v_last, v_last_cast);
  else
    update customers
    set visit_count = v_visits, total_spent = v_spent, last_visited = v_last,
        last_cast_id = v_last_cast, updated_at = now()
    where id = v_customer;
  end if;
end
$$;

create or replace function public.trg_sync_customer_stats()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_customer_stats_for(new.store_id, new.customer_phone, new.customer_name);
  end if;
  if tg_op = 'DELETE' then
    perform public.sync_customer_stats_for(old.store_id, old.customer_phone, old.customer_name);
  elsif tg_op = 'UPDATE' and (norm_phone(old.customer_phone) != norm_phone(new.customer_phone) or old.store_id != new.store_id) then
    perform public.sync_customer_stats_for(old.store_id, old.customer_phone, old.customer_name);
  end if;
  return null;
end
$$;

drop trigger if exists trg_sync_customer_stats on public.reservations;
create trigger trg_sync_customer_stats
after insert or update or delete on public.reservations
for each row execute function public.trg_sync_customer_stats();

-- 5. バックフィル: 過去の完了予約から顧客マスタと統計を補完
do $$
declare r record;
begin
  for r in
    select store_id,
           (array_agg(customer_name order by reservation_date desc))[1] as nm,
           (array_agg(customer_phone order by reservation_date desc))[1] as ph
    from reservations
    where status = 'completed' and length(norm_phone(customer_phone)) >= 10
    group by store_id, norm_phone(customer_phone)
  loop
    perform public.sync_customer_stats_for(r.store_id, r.ph, r.nm);
  end loop;
end $$;

-- 6. セラピストポータル用: 担当顧客カルテ取得（access_token認証・読み取り専用）
create or replace function public.get_therapist_customers(p_token text)
returns table(
  customer_id uuid, name text, phone text,
  visit_count integer, total_spent bigint, last_visited date,
  tags text[], notes text,
  preferred_pressure text, concern_areas text[], conversation_level text,
  ng_items text, preference_notes text,
  my_visit_count bigint, my_last_visit date
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_cast_id uuid;
  v_store uuid;
begin
  if p_token is null or length(p_token) < 8 then
    raise exception 'invalid token';
  end if;

  select c.id, c.store_id into v_cast_id, v_store
  from casts c where c.access_token = p_token;

  if v_cast_id is null then
    raise exception 'cast not found';
  end if;

  return query
  with mine as (
    select norm_phone(r.customer_phone) as np,
           count(*) as cnt,
           max(r.reservation_date) as last_d
    from reservations r
    where r.cast_id = v_cast_id and r.status = 'completed'
      and length(norm_phone(r.customer_phone)) >= 10
    group by norm_phone(r.customer_phone)
  )
  select cu.id, cu.name, cu.phone,
         cu.visit_count, cu.total_spent, cu.last_visited,
         cu.tags, cu.notes,
         cp.preferred_pressure, cp.concern_areas, cp.conversation_level,
         cp.ng_items, cp.preference_notes,
         m.cnt, m.last_d
  from mine m
  join customers cu on cu.store_id = v_store and norm_phone(cu.phone) = m.np
  left join customer_profiles cp on cp.customer_id = cu.id
  order by m.last_d desc;
end
$$;
