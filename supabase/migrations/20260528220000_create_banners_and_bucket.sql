-- トップページバナー
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  link_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.banners enable row level security;

create policy "banners_select"
on public.banners for select
using (true);

create policy "banners_admin"
on public.banners for all
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- バナー画像用ストレージバケット
insert into storage.buckets (id, name, public)
values ('banner-images', 'banner-images', true)
on conflict (id) do nothing;

create policy "Banner images are publicly accessible"
on storage.objects for select
using (bucket_id = 'banner-images');

create policy "Authenticated users can upload banner images"
on storage.objects for insert
with check (bucket_id = 'banner-images' and auth.role() = 'authenticated');

create policy "Authenticated users can update banner images"
on storage.objects for update
using (bucket_id = 'banner-images' and auth.role() = 'authenticated');

create policy "Authenticated users can delete banner images"
on storage.objects for delete
using (bucket_id = 'banner-images' and auth.role() = 'authenticated');
