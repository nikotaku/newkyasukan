-- HPニュースとエステ魂の店舗ニュース同時投稿の状態を記録する。
-- 外部サイトへ送信後、応答を確認できない場合の重複投稿を防ぐため、
-- posting / posted / failed をHP記事単位で保持する。

alter table public.hp_articles
  add column if not exists estama_status text not null default 'pending',
  add column if not exists estama_error text,
  add column if not exists estama_attempts integer not null default 0,
  add column if not exists estama_posted_at timestamptz,
  add column if not exists estama_news_url text;

alter table public.hp_articles
  drop constraint if exists hp_articles_estama_status_check;

alter table public.hp_articles
  add constraint hp_articles_estama_status_check
  check (estama_status in ('pending', 'posting', 'posted', 'failed', 'skipped'));

alter table public.hp_articles
  drop constraint if exists hp_articles_estama_attempts_nonnegative;

alter table public.hp_articles
  add constraint hp_articles_estama_attempts_nonnegative
  check (estama_attempts >= 0);

create index if not exists hp_articles_estama_status_idx
  on public.hp_articles (store_id, estama_status, created_at desc);
