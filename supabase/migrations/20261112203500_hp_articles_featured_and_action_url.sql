-- HPニュースの注目表示と個別の予約導線。既存記事は変更しない。
alter table public.hp_articles
  add column if not exists is_featured boolean not null default false,
  add column if not exists action_url text;

do $ begin
if not exists (select 1 from pg_constraint where conname = 'hp_articles_action_url_safe' and conrelid = 'public.hp_articles'::regclass) then
  alter table public.hp_articles add constraint hp_articles_action_url_safe check (
    action_url is null or action_url = '' or
    (length(action_url) <= 2048 and (
      action_url ~ '^/[a-zA-Z0-9/_?&=.%#-]*$' or
      action_url ~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9/_?&=.%+#-]*)?$'
    ))
  );
end if;
end $;

create index if not exists hp_articles_featured_idx
  on public.hp_articles (store_id, is_featured desc, created_at desc)
  where is_published = true;
