-- IVRYメール由来の問い合わせを発信者番号で再分類できるようにする。
-- 既存データの発信者番号を使い、0120-286-634（エステ魂の仮予約通知）を
-- 通常の電話問い合わせから分離して集計画面で表示する。

alter table public.inquiries
  add column if not exists source_message_id text,
  add column if not exists source_subject text,
  add column if not exists caller_number text,
  add column if not exists call_status text;

alter table public.inquiries
  drop constraint if exists inquiries_source_check;

alter table public.inquiries
  add constraint inquiries_source_check
  check (source in ('line', 'manual', 'ivry_email'));

create unique index if not exists idx_inquiries_source_message_id
  on public.inquiries (store_id, source, source_message_id)
  where source_message_id is not null;

create index if not exists idx_inquiries_ivry_caller_time
  on public.inquiries (store_id, caller_number, inquired_at desc)
  where source = 'ivry_email';
