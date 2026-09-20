-- 店長ブログは既存のHPニュース（hp_articles）と完全に分離する。
-- HPニュースの自動生成・トップページのお知らせ表示には影響しない。

-- 直前の暫定拡張を本番にも戻す。HPニュースは既存仕様のまま残す。
drop trigger if exists trg_set_hp_article_updated_at on public.hp_articles;
drop function if exists public.set_hp_article_updated_at();
drop index if exists public.hp_articles_store_published_at_idx;
drop index if exists public.hp_articles_store_slug_unique_idx;
alter table public.hp_articles
  drop column if exists excerpt,
  drop column if exists seo_title,
  drop column if exists seo_description,
  drop column if exists published_at;
drop policy if exists "store_isolation" on public.hp_articles;
drop policy if exists "Authenticated users can manage hp_articles" on public.hp_articles;
create policy "Authenticated users can manage hp_articles"
  on public.hp_articles
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.manager_blog_posts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  slug text not null,
  category text not null default 'tips',
  excerpt text,
  content text not null,
  seo_title text,
  seo_description text,
  image_urls text[] not null default '{}'::text[],
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manager_blog_posts_store_slug_unique_idx
  on public.manager_blog_posts (store_id, slug);

create index if not exists manager_blog_posts_store_published_at_idx
  on public.manager_blog_posts (store_id, is_published, published_at desc nulls last, created_at desc);

alter table public.manager_blog_posts enable row level security;

create policy "Public can read published manager blog posts"
  on public.manager_blog_posts
  for select
  to anon
  using (is_published = true);

create policy "store_isolation"
  on public.manager_blog_posts
  for all
  to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

create or replace function public.set_manager_blog_post_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.is_published and new.published_at is null then
    new.published_at = now();
  end if;
  if not new.is_published then
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_manager_blog_post_updated_at on public.manager_blog_posts;
create trigger trg_set_manager_blog_post_updated_at
before insert or update on public.manager_blog_posts
for each row execute function public.set_manager_blog_post_updated_at();

grant select, insert, update, delete on table public.manager_blog_posts to authenticated;
grant select on table public.manager_blog_posts to anon;
