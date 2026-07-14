-- 外部（セラピスト個人）予約フォームの送信ログ。
-- 店舗の reservations / customers とは連携しない独立テーブル。
-- メール通知が失敗しても予約内容が消えないためのフェイルセーフ。

create table if not exists public.external_bookings (
  id uuid primary key default gen_random_uuid(),
  form_slug text not null,             -- 'keika' など
  customer_name text not null,
  customer_phone text,
  requested_date date,
  requested_time text,
  course text,
  options text[],
  total_price integer,
  notes text,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_bookings_created on public.external_bookings (created_at desc);

alter table public.external_bookings enable row level security;

-- 書き込みは Edge Function（service role）のみ。管理画面からは閲覧可。
create policy "external_bookings_select_authenticated" on public.external_bookings
  for select to authenticated using (true);
