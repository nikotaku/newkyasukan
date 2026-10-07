-- 宣伝ノルマ（/promotion-schedule の「今月の露出ノルマ」）
-- セラピストごとに、その月の出勤日数に応じて「この月に最低これだけ露出する」を数で決め、実績を数える。
--   promotion_quota_settings : 店舗ごとの決まり（出勤日数の段階ごとの回数・新人の上乗せ）。中身は src/lib/promotionQuota.ts が読む
--   promotion_exposures      : 露出の記録（HPトップバナー・HPニュース・X・O2・エスたまニュース・エスたまトップバナー）
-- 実績は、この記録に加えて、企画（promotion_plan_tasks の完了した投稿）・HPニュース（hp_articles）・
-- X運用表で投稿したもの（x_daily_posts）を画面側で名前から数える。

create table if not exists public.promotion_quota_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.promotion_quota_settings enable row level security;
revoke all on public.promotion_quota_settings from anon;
grant select, insert, update on public.promotion_quota_settings to authenticated;

create policy promotion_quota_settings_member_read on public.promotion_quota_settings
  for select to authenticated
  using (store_id in (select public.current_store_ids()));
create policy promotion_quota_settings_manager_insert on public.promotion_quota_settings
  for insert to authenticated
  with check ((select public.can_manage_store(store_id)));
create policy promotion_quota_settings_manager_update on public.promotion_quota_settings
  for update to authenticated
  using ((select public.can_manage_store(store_id)))
  with check ((select public.can_manage_store(store_id)));

create table if not exists public.promotion_exposures (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  channel_key text not null check (channel_key in (
    'hp_top_banner', 'hp_news', 'x_post', 'o2_post', 'estama_news', 'estama_top_banner'
  )),
  exposed_on date not null,
  plan_id uuid references public.promotion_plans(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  url text check (url is null or char_length(url) <= 1000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_promotion_exposures_store_date on public.promotion_exposures (store_id, exposed_on);
create index if not exists idx_promotion_exposures_cast_date on public.promotion_exposures (cast_id, exposed_on);

alter table public.promotion_exposures enable row level security;
revoke all on public.promotion_exposures from anon;
grant select, insert, update, delete on public.promotion_exposures to authenticated;

create policy promotion_exposures_member on public.promotion_exposures
  for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

-- 他店のセラピスト・企画を記録に付けない
create or replace function public.promotion_exposures_check_store()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from casts c where c.id = new.cast_id and c.store_id = new.store_id) then
    raise exception 'cast does not belong to this store';
  end if;
  if new.plan_id is not null
     and not exists (select 1 from promotion_plans p where p.id = new.plan_id and p.store_id = new.store_id) then
    raise exception 'plan does not belong to this store';
  end if;
  return new;
end
$$;

revoke all on function public.promotion_exposures_check_store() from public, anon, authenticated;

create trigger trg_promotion_exposures_check_store
  before insert or update on public.promotion_exposures
  for each row execute function public.promotion_exposures_check_store();
