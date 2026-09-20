-- /blog 公開と編集管理に必要な、既存 hp_articles のSEO・公開管理項目を追加する。
-- 既存のお知らせ記事はそのままブログ記事として表示可能にする。

alter table public.hp_articles
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists published_at timestamptz;

-- 既に公開されている記事は公開日時を作成日時で補完し、URL・表示順を安定させる。
update public.hp_articles
set published_at = created_at
where is_published = true
  and published_at is null;

create index if not exists hp_articles_store_published_at_idx
  on public.hp_articles (store_id, is_published, published_at desc nulls last, created_at desc);

create unique index if not exists hp_articles_store_slug_unique_idx
  on public.hp_articles (store_id, slug)
  where slug is not null;

-- タイトルから作られたURLの重複ではなく、店舗単位で一意にする。
alter table public.hp_articles
  drop constraint if exists hp_articles_slug_key;

-- 更新時刻を確実に記録する。
create or replace function public.set_hp_article_updated_at()
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

drop trigger if exists trg_set_hp_article_updated_at on public.hp_articles;
create trigger trg_set_hp_article_updated_at
before insert or update on public.hp_articles
for each row execute function public.set_hp_article_updated_at();

-- 旧ポリシーの全店舗操作を廃止し、既存の店舗分離ポリシーだけを有効にする。
drop policy if exists "Authenticated users can manage hp_articles" on public.hp_articles;

grant select, insert, update, delete on table public.hp_articles to authenticated;

grant select on table public.hp_articles to anon;
