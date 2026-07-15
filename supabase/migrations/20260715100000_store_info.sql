-- 店舗の連絡先・基本情報。管理画面（/hp/store-info）から編集し、
-- 公開HP全体（電話番号・予約用LINEなど）に反映される。

create table if not exists public.store_info (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null default '全力エステ 仙台',
  description text,
  address text,
  phone text,
  email text,
  hours text,
  holiday text,
  lat double precision,
  lng double precision,
  twitter_url text,
  line_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_info enable row level security;

-- 公開HPが読むため anon にも SELECT を許可。編集はログインユーザーのみ。
create policy "store_info_public_select" on public.store_info
  for select to public using (true);
create policy "store_info_authenticated_insert" on public.store_info
  for insert to authenticated with check (true);
create policy "store_info_authenticated_update" on public.store_info
  for update to authenticated using (true);

-- 初期データ（電話番号は 090-8126-4042）
insert into public.store_info (name, address, phone, hours, holiday, twitter_url, line_url)
select '全力エステ 仙台', '宮城県仙台市青葉区', '09081264042',
       '12:00〜26:00（24:40最終受付）', '年中無休',
       'https://twitter.com/zr_news1', 'https://lin.ee/RdRhmXw'
where not exists (select 1 from public.store_info);
