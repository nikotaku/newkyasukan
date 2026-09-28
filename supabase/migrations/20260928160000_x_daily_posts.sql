-- X運用表「今日の投稿」：その日の投稿文（AIで作った文・手直しした文）と「投稿した」チェックを日ごとに残す。
-- 出勤・空き枠などのデータから作る投稿は、text が null のあいだ画面を開くたびに最新のデータで作り直す。
create table public.x_daily_posts (
  store_id uuid not null references public.stores(id) on delete cascade,
  post_date date not null,
  account_key text not null,
  slot_key text not null,
  text text,
  text_source text check (text_source in ('ai', 'edited')),
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  posted_text text,
  updated_at timestamptz not null default now(),
  primary key (store_id, post_date, account_key, slot_key)
);

alter table public.x_daily_posts enable row level security;

revoke all on public.x_daily_posts from anon;
grant select, insert, update, delete on public.x_daily_posts to authenticated;

create policy x_daily_posts_member on public.x_daily_posts for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));
