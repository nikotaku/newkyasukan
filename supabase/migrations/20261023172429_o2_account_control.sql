create table public.o2_control_settings (
 store_id uuid primary key references public.stores(id) on delete cascade,
 enabled boolean not null default false,
 checked_at timestamptz,
 last_status text not null default 'not_checked',
 last_error text,
 email_checked_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.o2_link_requests (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 cast_id uuid references public.casts(id) on delete set null,
 username text not null,
 display_name text not null,
 profile_url text not null,
 source_url text not null,
 status text not null default 'pending' check(status in ('pending','approving','approved','resolved','review_required')),
 error text,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid references auth.users(id),
 unique(store_id,username)
);
create index o2_link_requests_store_status on public.o2_link_requests(store_id,status);
create index o2_link_requests_cast on public.o2_link_requests(cast_id);
create table public.o2_account_jobs (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 cast_id uuid not null references public.casts(id) on delete cascade,
 kind text not null check(kind in ('register','check')),
 status text not null default 'queued' check(status in ('queued','running','awaiting_email','awaiting_review','completed','failed','review_required')),
 login_email text,
 username text,
 error text,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 updated_at timestamptz not null default now()
);
create index o2_account_jobs_store_date on public.o2_account_jobs(store_id,created_at desc);
create index o2_account_jobs_cast on public.o2_account_jobs(cast_id);
create unique index o2_account_jobs_open on public.o2_account_jobs(cast_id) where status in ('queued','running','awaiting_email');
-- Secrets (temporary cookies and OTPs) never have client grants.
create table public.o2_control_secrets (
 job_id uuid primary key references public.o2_account_jobs(id) on delete cascade,
 session jsonb not null default '{}'::jsonb,
 code text,
 message_id text unique,
 code_received_at timestamptz,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.o2_control_locks (
 store_id uuid primary key references public.stores(id) on delete cascade,
 locked_until timestamptz not null
);
revoke all on public.o2_control_secrets, public.o2_control_locks from public,anon,authenticated;
grant all on public.o2_control_secrets, public.o2_control_locks to service_role;
alter table public.o2_control_secrets enable row level security;
alter table public.o2_control_locks enable row level security;
alter table public.o2_control_settings enable row level security;
alter table public.o2_link_requests enable row level security;
alter table public.o2_account_jobs enable row level security;
revoke all on public.o2_control_settings,public.o2_link_requests,public.o2_account_jobs from public,anon,authenticated;
grant select on public.o2_control_settings,public.o2_link_requests,public.o2_account_jobs to authenticated;
grant all on public.o2_control_settings,public.o2_link_requests,public.o2_account_jobs to service_role;
create policy o2_control_settings_read on public.o2_control_settings for select to authenticated using ((select public.can_manage_store(store_id)));
create policy o2_link_requests_read on public.o2_link_requests for select to authenticated using ((select public.can_manage_store(store_id)));
create policy o2_account_jobs_read on public.o2_account_jobs for select to authenticated using ((select public.can_manage_store(store_id)));
create or replace function public.claim_o2_control_lock(p_store_id uuid) returns boolean language sql security invoker set search_path='' as $$
 with claimed as(insert into public.o2_control_locks(store_id,locked_until) values(p_store_id,now()+interval '3 minutes') on conflict(store_id) do update set locked_until=excluded.locked_until where public.o2_control_locks.locked_until<now() returning 1) select exists(select 1 from claimed)
$$;
revoke all on function public.claim_o2_control_lock(uuid) from public,anon,authenticated;
grant execute on function public.claim_o2_control_lock(uuid) to service_role;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'o2_control_worker_secret');
create or replace function public.verify_o2_control_worker(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select p_secret is not null and exists(select 1 from vault.decrypted_secrets where name='o2_control_worker_secret' and decrypted_secret=p_secret)
$$;
revoke all on function public.verify_o2_control_worker(text) from public,anon,authenticated;
grant execute on function public.verify_o2_control_worker(text) to service_role;
create or replace function private.dispatch_o2_control(p_store_id uuid default null) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; token text;
begin
 select decrypted_secret into token from vault.decrypted_secrets where name='o2_control_worker_secret';
 select net.http_post(url:='https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/o2-control',headers:=jsonb_build_object('Content-Type','application/json','x-o2-worker-secret',token),body:=jsonb_build_object('action','worker','storeId',p_store_id),timeout_milliseconds:=120000) into result;
 return result;
end $$;
revoke all on function private.dispatch_o2_control(uuid) from public,anon,authenticated;
select cron.schedule('o2-control-every-five-minutes','*/5 * * * *','select private.dispatch_o2_control()');
create or replace function public.create_o2_mail_relay_token(p_store_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare t text;
begin
 if auth.uid() is null or not public.can_manage_store(p_store_id) then raise exception 'この店舗を管理する権限がありません'; end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.report_ingest_tokens(store_id,token_hash,label) values(p_store_id,encode(extensions.digest(t,'sha256'),'hex'),'02認証メール');
 return t;
end $$;
revoke all on function public.create_o2_mail_relay_token(uuid) from public,anon;
grant execute on function public.create_o2_mail_relay_token(uuid) to authenticated;
insert into public.o2_control_settings(store_id,enabled) select id,true from public.stores where name='艶華';
