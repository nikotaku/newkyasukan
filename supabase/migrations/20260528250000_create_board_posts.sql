-- タイムライン投稿（旧: 掲示板/お知らせを統一）
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_name text not null default '管理者',
  title text not null default '-',
  content text not null,
  is_pinned boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.board_posts enable row level security;

create policy "board_posts_auth_select"
on public.board_posts for select
using (auth.uid() is not null);

create policy "board_posts_auth_all"
on public.board_posts for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
