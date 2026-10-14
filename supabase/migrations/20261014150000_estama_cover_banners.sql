-- エステ魂のカバー画像（店舗プロフィールの「集客用 カバー画像」3枠、店舗ページ上部のスライド）を、
-- HPのトップバナーと同じセラピストのバナーで毎日入れ替える。
--   設定：stores.settings.estama_cover_banners = { "enabled": true, "slots": [2, 3] }
--         slots はエステ魂のカバー画像の枠（1〜3）。既定は 2・3（1枠目はお店の固定のカバー。SNSで共有されたときの画像にもなる）
--   流れ：pg_cron estama-cover-banners（5分ごとに確認）→ private.dispatch_estama_cover_banners()
--         → private.estama_scout_call(store, 'cover-banners') → Vercel /api/cron/estama-appeal?action=estama-scout（mode cover-banners、本体 server/estama-cover-banners.ts）
--         朝10時以降に1日1回。毎時27〜42分（空き枠更新）は動かさない。失敗したら30分あけて1日3回まで
--   画像：HPの /banner-render（1000×500）をブラウザで撮って、そのままエステ魂へ上げる（HPと同じデザイン・同じ写真）
--   記録：estama_cover_rotations（1日1行）。出た人は露出ノルマ「エスたまトップバナー」（promotion_exposures）に自動で記録

create table if not exists public.estama_cover_rotations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  rotation_date date not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  slots integer[] not null default '{}',
  cast_ids uuid[] not null default '{}',
  cast_names text[] not null default '{}',
  image_urls text[] not null default '{}',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, rotation_date)
);

alter table public.estama_cover_rotations enable row level security;
revoke all on public.estama_cover_rotations from anon;
grant select on public.estama_cover_rotations to authenticated;
drop policy if exists estama_cover_rotations_read on public.estama_cover_rotations;
create policy estama_cover_rotations_read on public.estama_cover_rotations for select to authenticated
  using (store_id in (select public.current_store_ids()));

-- 営業日（朝6時切り替え）
create or replace function private.estama_cover_business_date()
returns date language sql stable as $$
  select (timezone('Asia/Tokyo', now()) - interval '6 hours')::date
$$;

create or replace function private.estama_cover_slots(p_settings jsonb)
returns integer[] language sql immutable as $$
  select coalesce(
    (select array_agg(distinct v::int order by v::int)
     from jsonb_array_elements_text(case when jsonb_typeof(p_settings -> 'estama_cover_banners' -> 'slots') = 'array'
                                         then p_settings -> 'estama_cover_banners' -> 'slots' else '[]'::jsonb end) v
     where v ~ '^[1-3]$'),
    array[2, 3])
$$;

-- ワーカー：この実行で作るもの（店舗・営業日・枠）。実行トークンで本人確認
create or replace function public.start_estama_cover_rotation(p_run_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_settings jsonb;
  v_date date := private.estama_cover_business_date();
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;
  select coalesce(settings, '{}'::jsonb) into v_settings from public.stores where id = v_store;

  insert into public.estama_cover_rotations as r (store_id, rotation_date, status, attempts, started_at)
  values (v_store, v_date, 'running', 1, now())
  on conflict (store_id, rotation_date) do update
    set status = 'running', attempts = r.attempts + 1, started_at = now(), error = null, finished_at = null;

  return jsonb_build_object(
    'storeId', v_store,
    'date', v_date,
    'slots', to_jsonb(private.estama_cover_slots(v_settings)),
    'enabled', coalesce((v_settings -> 'estama_cover_banners' ->> 'enabled')::boolean, false)
  );
end
$$;

-- ワーカー：結果を記録。done なら出た人を露出ノルマ（エスたまトップバナー）に入れる
create or replace function public.finish_estama_cover_rotation(
  p_run_token text, p_status text, p_slots integer[], p_cast_ids uuid[], p_cast_names text[], p_image_urls text[], p_error text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_date date := private.estama_cover_business_date();
begin
  if coalesce(p_run_token, '') !~ '^[0-9a-f]{64}$' then return false; end if;
  select store_id into v_store from private.estama_scout_runs
  where token_hash = encode(extensions.digest(p_run_token, 'sha256'), 'hex') and expires_at > now();
  if v_store is null then raise exception using message = '実行トークンが無効です', errcode = '42501'; end if;
  if p_status not in ('done', 'failed', 'skipped') then raise exception 'status が不正です'; end if;

  update public.estama_cover_rotations
  set status = p_status,
      slots = coalesce(p_slots, '{}'),
      cast_ids = coalesce(p_cast_ids, '{}'),
      cast_names = coalesce(p_cast_names, '{}'),
      image_urls = coalesce(p_image_urls, '{}'),
      error = left(p_error, 1000),
      finished_at = now(),
      requested_at = null
  where store_id = v_store and rotation_date = v_date;

  if p_status = 'done' then
    insert into public.promotion_exposures (store_id, cast_id, channel_key, exposed_on, note)
    select v_store, c.id, 'estama_top_banner', v_date, '自動：エステ魂のカバー画像（セラピストのバナー）'
    from public.casts c
    where c.store_id = v_store and c.id = any(coalesce(p_cast_ids, '{}'))
      and not exists (
        select 1 from public.promotion_exposures e
        where e.cast_id = c.id and e.channel_key = 'estama_top_banner' and e.exposed_on = v_date
      );
  end if;
  return true;
end
$$;

revoke all on function public.start_estama_cover_rotation(text) from public;
grant execute on function public.start_estama_cover_rotation(text) to anon, authenticated;
revoke all on function public.finish_estama_cover_rotation(text, text, integer[], uuid[], text[], text[], text) from public;
grant execute on function public.finish_estama_cover_rotation(text, text, integer[], uuid[], text[], text[], text) to anon, authenticated;

-- 管理画面の「今すぐ反映」（店長・オーナー）。次の確認（5分以内）で、今日の分をもう一度作る
create or replace function public.request_estama_cover_rotation(p_store_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := private.estama_cover_business_date();
begin
  if not public.can_manage_store(p_store_id) then
    raise exception using message = '店長・オーナーだけが操作できます', errcode = '42501';
  end if;
  insert into public.estama_cover_rotations as r (store_id, rotation_date, status, attempts, requested_at)
  values (p_store_id, v_date, 'failed', 0, now())
  on conflict (store_id, rotation_date) do update
    set requested_at = now(),
        attempts = case when r.status = 'running' then r.attempts else 0 end,
        status = case when r.status = 'running' then r.status else 'failed' end,
        error = case when r.status = 'running' then r.error else null end;
  return true;
end
$$;
revoke all on function public.request_estama_cover_rotation(uuid) from public, anon;
grant execute on function public.request_estama_cover_rotation(uuid) to authenticated;

-- 5分ごと：設定がオンの店舗で、今日の分がまだなら作る
create or replace function private.dispatch_estama_cover_banners()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_calls integer := 0;
  v_now timestamp := timezone('Asia/Tokyo', now());
  v_minute integer := extract(minute from v_now)::int;
  v_date date := private.estama_cover_business_date();
begin
  -- 空き枠更新（毎時27〜42分）と重ねない。朝10時より前（出勤が決まる前・夜中）は自動では動かさない
  if v_minute between 25 and 44 then return 0; end if;
  for r in
    select s.id as store_id, rot.status, rot.attempts, rot.started_at, rot.requested_at
    from public.stores s
    join public.automation_connections c
      on c.store_id = s.id and c.provider = 'estama' and c.status = 'ready' and c.browserbase_context_id is not null
    left join public.estama_cover_rotations rot on rot.store_id = s.id and rot.rotation_date = v_date
    where coalesce((s.settings -> 'estama_cover_banners' ->> 'enabled')::boolean, false)
  loop
    -- 実行中（10分以内）は待つ。1日（「今すぐ反映」からは1回の依頼）につき3回まで
    if r.status = 'running' and r.started_at > now() - interval '10 minutes' then continue; end if;
    if coalesce(r.attempts, 0) >= 3 then continue; end if;
    if r.requested_at is null then
      if r.status in ('done', 'skipped') then continue; end if;
      if extract(hour from v_now)::int between 6 and 9 then continue; end if;
      if r.started_at is not null and r.started_at > now() - interval '30 minutes' then continue; end if;
    end if;
    perform private.estama_scout_call(r.store_id, 'cover-banners', null);
    v_calls := v_calls + 1;
  end loop;
  return v_calls;
end
$$;
revoke all on function private.dispatch_estama_cover_banners() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'estama-cover-banners';
select cron.schedule('estama-cover-banners', '*/5 * * * *', $$select private.dispatch_estama_cover_banners()$$);
