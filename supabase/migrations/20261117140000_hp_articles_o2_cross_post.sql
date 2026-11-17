-- HPのニュースを公開したら、エステ魂のニュースとO2（店舗アカウント）にも出す。記事ごとに送り先を選べるようにし、O2の結果を記録する。
alter table public.hp_articles
  add column if not exists post_to_estama boolean not null default true,
  add column if not exists post_to_o2 boolean not null default true,
  add column if not exists o2_status text not null default 'pending',
  add column if not exists o2_error text,
  add column if not exists o2_attempts integer not null default 0,
  add column if not exists o2_posted_at timestamptz,
  add column if not exists o2_post_url text;

-- 今までの記事はO2に出していないので、過去の分を送らないよう「対象外」にしておく
update public.hp_articles set o2_status = 'skipped', post_to_o2 = false where o2_status = 'pending';
