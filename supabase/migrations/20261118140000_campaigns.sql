-- 設定ダッシュボードの「キャンペーン」タブ。店のキャンペーンの名前・内容・適用期間・備考・継続中かアーカイブかを残す（社内の管理用。HPには出さない）。
-- 割引（discounts）と結びつけられる（任意）。変更は「変更の記録」（rate_master_changes）に残る。
create table if not exists public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null default '00000000-0000-0000-0000-000000000001' references public.stores(id) on delete cascade,
  name         text not null,
  details      text,
  start_date   date,
  end_date     date,
  notes        text,
  discount_id  uuid references public.discounts(id) on delete set null,
  archived_at  timestamptz,
  display_order integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint campaigns_period check (start_date is null or end_date is null or start_date <= end_date)
);

create index if not exists idx_campaigns_store on public.campaigns (store_id, archived_at, start_date);

alter table public.campaigns enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_manage') then
    create policy "campaigns_manage" on public.campaigns for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'store_isolation') then
    create policy "store_isolation" on public.campaigns as restrictive for all to authenticated
      using (store_id in (select public.current_store_ids()))
      with check (store_id in (select public.current_store_ids()));
  end if;
end
$$;

revoke all on public.campaigns from anon;
grant select, insert, update, delete on public.campaigns to authenticated;

create or replace trigger trg_set_store_id before insert on public.campaigns
  for each row execute function public.set_store_id();

create or replace function private.touch_campaign_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger trg_touch_campaign_updated_at before update on public.campaigns
  for each row execute function private.touch_campaign_updated_at();

create or replace trigger trg_log_rate_master_change after insert or update or delete on public.campaigns
  for each row execute function private.log_rate_master_change();
