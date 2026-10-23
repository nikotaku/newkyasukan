alter table public.o2_account_jobs drop constraint o2_account_jobs_kind_check;
alter table public.o2_account_jobs add constraint o2_account_jobs_kind_check check(kind in ('register','check','profile'));
create table public.o2_control_mail_receipts (
 store_id uuid not null references public.stores(id) on delete cascade,
 message_id text not null,
 received_at timestamptz not null default now(),
 primary key(store_id,message_id)
);
alter table public.o2_control_mail_receipts enable row level security;
revoke all on public.o2_control_mail_receipts from public,anon,authenticated;
grant all on public.o2_control_mail_receipts to service_role;
create index o2_control_mail_receipts_date on public.o2_control_mail_receipts(received_at);
