-- Gmailに届くレポートメール（IVRyの着信通知・エステ魂のデイリーレポート）を、
-- 店舗のGmailで動く Google Apps Script から Edge Function report-email-ingest で取り込む。
-- どちらも service_role（Edge Function）だけが読み書きする。

create table if not exists public.report_ingest_tokens (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  -- トークン本体は保存せず SHA-256（16進）だけを持つ
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.report_email_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  message_id text not null,
  kind text not null check (kind in ('ivry_call', 'estama_daily_report', 'unknown')),
  subject text,
  sender text,
  received_at timestamptz,
  body text,
  parsed jsonb,
  status text not null default 'received'
    check (status in ('received', 'imported', 'duplicate', 'kept_existing', 'unparsed', 'ignored')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, message_id)
);

create index if not exists report_email_messages_store_received_idx
  on public.report_email_messages (store_id, received_at desc);

alter table public.report_ingest_tokens enable row level security;
alter table public.report_email_messages enable row level security;

revoke all on table public.report_ingest_tokens from anon, authenticated;
revoke all on table public.report_email_messages from anon, authenticated;
grant all on table public.report_ingest_tokens to service_role;
grant all on table public.report_email_messages to service_role;
