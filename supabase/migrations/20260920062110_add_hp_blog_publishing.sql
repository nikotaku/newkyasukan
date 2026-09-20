-- 2026-09-20 に適用した暫定ブログ拡張を取り消す。
-- HPニュース（hp_articles）は既存の自動生成・トップページ表示用として維持し、
-- 店長ブログは次の manager_blog_posts テーブルで分離する。

drop trigger if exists trg_set_hp_article_updated_at on public.hp_articles;
drop function if exists public.set_hp_article_updated_at();

drop index if exists public.hp_articles_store_published_at_idx;
drop index if exists public.hp_articles_store_slug_unique_idx;

alter table public.hp_articles
  drop column if exists excerpt,
  drop column if exists seo_title,
  drop column if exists seo_description,
  drop column if exists published_at;

-- HPニュースの既存管理画面は従来どおり、認証済みユーザーから操作できる。
drop policy if exists "store_isolation" on public.hp_articles;
create policy "Authenticated users can manage hp_articles"
  on public.hp_articles
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.hp_articles to authenticated;
grant select on table public.hp_articles to anon;
