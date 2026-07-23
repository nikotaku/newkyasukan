-- 各種媒体（エスたま等）の掲載設定シート
create table if not exists public.media_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.stores(id),
  media_name text not null,
  url text,
  login_id text,
  login_password text,
  shop_name text,
  catch_copy text,
  description text,
  main_color text,
  sub_color text,
  plan text,
  memo text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_settings enable row level security;

create policy "authenticated_all_media_settings" on public.media_settings
  for all to authenticated using (true) with check (true);

create policy "store_isolation" on public.media_settings
  as restrictive for all to authenticated
  using (store_id in (select store_id from public.user_stores where user_id = auth.uid()))
  with check (store_id in (select store_id from public.user_stores where user_id = auth.uid()));

create trigger set_store_id_media_settings
  before insert on public.media_settings
  for each row execute function public.set_store_id();
