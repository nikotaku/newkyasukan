-- パスワード管理DB（各種サービスの認証情報）
create table if not exists public.password_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'その他',
  url text,
  login_id text,
  login_password text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.password_entries enable row level security;

-- 認証情報のため、ログインユーザーのみ閲覧・編集可能
create policy "password_entries_auth_select"
on public.password_entries for select
using (auth.uid() is not null);

create policy "password_entries_auth_all"
on public.password_entries for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
