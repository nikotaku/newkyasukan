-- 問い合わせ記録（LINE bot・管理画面から入力。WEB予約はreservationsから自動集計）
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.stores(id),
  channel text not null check (channel in ('phone','line','other')),
  memo text,
  source text not null default 'manual' check (source in ('line','manual')),
  inquired_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiries_store_time on public.inquiries (store_id, inquired_at);

alter table public.inquiries enable row level security;

create policy "authenticated_all_inquiries" on public.inquiries
  for all to authenticated using (true) with check (true);

create policy "store_isolation" on public.inquiries
  as restrictive for all to authenticated
  using (store_id in (select store_id from public.user_stores where user_id = auth.uid()))
  with check (store_id in (select store_id from public.user_stores where user_id = auth.uid()));

create trigger set_store_id_inquiries
  before insert on public.inquiries
  for each row execute function public.set_store_id();
