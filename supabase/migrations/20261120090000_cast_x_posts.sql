-- 本人のXの投稿を、店長アカウント（SNS連携管理の「店舗の投稿先」の X・店長 = account_key 'tencho'）のキーで X API から読み、
-- 露出ノルマの「本人投稿 › 本人X」と、企画の本人のX投稿タスクの自動チェックに使う。
-- 読むのは Edge Function x-cast-posts（pg_cron から。キーがそろった店舗だけ動く）。

-- セラピストのXアカウント（casts.x_account から取り出したID と X の数字のID、どこまで読んだか）
create table if not exists public.cast_x_accounts (
  cast_id      uuid primary key references public.casts(id) on delete cascade,
  store_id     uuid not null default '00000000-0000-0000-0000-000000000001' references public.stores(id) on delete cascade,
  username     text not null,
  x_user_id    text,
  since_id     text,
  last_checked_at timestamptz,
  last_error   text,
  updated_at   timestamptz not null default now()
);

-- 読み取った本人の投稿（リポスト・返信は読まない）
create table if not exists public.cast_x_posts (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.stores(id) on delete cascade,
  cast_id     uuid not null references public.casts(id) on delete cascade,
  tweet_id    text not null unique,
  text        text,
  posted_at   timestamptz not null,
  url         text,
  is_reply    boolean not null default false,
  is_retweet  boolean not null default false,
  fetched_at  timestamptz not null default now()
);
create index if not exists idx_cast_x_posts_store_time on public.cast_x_posts (store_id, posted_at desc);
create index if not exists idx_cast_x_posts_cast_time on public.cast_x_posts (cast_id, posted_at desc);

-- 店舗ごとの読み取りの状況（最後に読んだ時刻・エラー・止めている理由）
create table if not exists public.cast_x_read_status (
  store_id         uuid primary key references public.stores(id) on delete cascade,
  enabled          boolean not null default true,
  interval_minutes integer not null default 180 check (interval_minutes between 30 and 1440),
  last_run_at      timestamptz,
  last_ok_at       timestamptz,
  last_error       text,
  last_error_at    timestamptz,
  blocked_until    timestamptz,
  last_read_count  integer,
  updated_at       timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['cast_x_accounts', 'cast_x_posts', 'cast_x_read_status'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'store_isolation') then
      execute format('create policy "store_isolation" on public.%I as restrictive for all to authenticated using (store_id in (select public.current_store_ids())) with check (store_id in (select public.current_store_ids()))', t);
    end if;
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end
$$;

-- 読み取りの間隔・オンオフは店長・オーナーが変えられる
create or replace function public.set_cast_x_read_settings(p_store_id uuid, p_enabled boolean, p_interval_minutes integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  insert into public.cast_x_read_status (store_id, enabled, interval_minutes)
  values (p_store_id, coalesce(p_enabled, true), coalesce(p_interval_minutes, 180))
  on conflict (store_id) do update
    set enabled = coalesce(p_enabled, public.cast_x_read_status.enabled),
        interval_minutes = coalesce(p_interval_minutes, public.cast_x_read_status.interval_minutes),
        blocked_until = null,
        updated_at = now();
end;
$$;
revoke all on function public.set_cast_x_read_settings(uuid, boolean, integer) from public, anon;
grant execute on function public.set_cast_x_read_settings(uuid, boolean, integer) to authenticated;

-- 店長アカウントの X のキー（4つ）がそろっている店舗
create or replace function private.cast_x_read_channel(p_store_id uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.store_post_channels c
  where c.store_id = p_store_id and c.platform = 'x' and c.account_key = 'tencho'
    and (select count(*) from vault.decrypted_secrets s
         where s.name like 'store_post_channel:' || c.id::text || ':%' and coalesce(s.decrypted_secret, '') <> '') >= 4
  limit 1
$$;
revoke all on function private.cast_x_read_channel(uuid) from public, anon, authenticated;

-- 読む時期が来た店舗（キーがそろい、オンで、止めていない、前回から間隔が過ぎた）
create or replace function public.cast_x_read_due_stores()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select st.id from public.stores st
  left join public.cast_x_read_status rs on rs.store_id = st.id
  where private.cast_x_read_channel(st.id) is not null
    and coalesce(rs.enabled, true)
    and (rs.blocked_until is null or rs.blocked_until < now())
    and (rs.last_run_at is null or rs.last_run_at < now() - make_interval(mins => coalesce(rs.interval_minutes, 180) - 5))
$$;
revoke all on function public.cast_x_read_due_stores() from public, anon, authenticated;
grant execute on function public.cast_x_read_due_stores() to service_role;

-- Edge Function（service_role）から企画の自動チェックを回す
create or replace function public.run_promotion_task_autocheck_service(p_store_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.auto_check_promotion_tasks(p_store_id);
end;
$$;
revoke all on function public.run_promotion_task_autocheck_service(uuid) from public, anon, authenticated;
grant execute on function public.run_promotion_task_autocheck_service(uuid) to service_role;

-- 定時実行（毎時19分）：読む時期が来た店舗があるときだけ Edge Function x-cast-posts を呼ぶ
create or replace function private.dispatch_cast_x_posts()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_request_id bigint;
begin
  if not exists (select 1 from public.cast_x_read_due_stores()) then
    return null;
  end if;
  select net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/x-cast-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-auto-post-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'x_auto_post_internal_secret')
    ),
    body := jsonb_build_object('action', 'run'),
    timeout_milliseconds := 150000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_cast_x_posts() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'cast-x-posts-hourly';
select cron.schedule('cast-x-posts-hourly', '19 * * * *', 'select private.dispatch_cast_x_posts();');

-- 企画の自動チェック：本人のX投稿（kind = self_x）も、読み取った本人の投稿（その営業日）で✓を付ける。
-- 今の private.promotion_task_evidence に self_x の分だけ足す（ほかの媒体の判定はそのまま）。
do $migration$
declare
  v_def text := pg_get_functiondef('private.promotion_task_evidence(public.promotion_plan_tasks)'::regprocedure);
  v_skip_old text := $q$if v_kind in ('manual', 'self_x', 'o2_story') then return null; end if;$q$;
  v_skip_new text := $q$if v_kind in ('manual', 'o2_story') then return null; end if;$q$;
  v_anchor text := $q$  if v_kind = 'self_o2' then$q$;
  v_kind_line text := $q$  v_kind := private.promotion_task_kind(p_task.label, p_task.channel_key);$q$;
  -- 宣伝先が「X」「O2」で見出しに「店舗」が無い投稿は本人の担当（is_therapist_promotion_task）。本人の投稿で確かめる
  v_kind_fix text := $q$
  if coalesce(private.is_therapist_promotion_task(p_task.task_type, p_task.label, p_task.channel_key), false) then
    if v_kind = 'store_x' then v_kind := 'self_x'; end if;
    if v_kind = 'store_o2' then v_kind := 'self_o2'; end if;
  end if;$q$;
  v_self_x text := $q$  if v_kind = 'self_x' then
    select xp.posted_at as at, xp.url as url into v_hit
    from public.cast_x_posts xp
    where xp.cast_id = any(v_cast_ids) and not xp.is_retweet and not xp.is_reply
      and xp.posted_at >= v_from and xp.posted_at < v_to
    order by xp.posted_at limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', '本人のXに投稿（' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', v_hit.url, 'at', v_hit.at);
    end if;
    return null;
  end if;

$q$;
begin
  if position('self_x'' then' in v_def) > 0 then
    return; -- もう入っている
  end if;
  if position(v_skip_old in v_def) = 0 or position(v_anchor in v_def) = 0 or position(v_kind_line in v_def) = 0 then
    raise exception 'promotion_task_evidence の形が想定と違います';
  end if;
  v_def := replace(v_def, v_skip_old, v_skip_new);
  v_def := replace(v_def, v_kind_line, v_kind_line || v_kind_fix);
  v_def := replace(v_def, v_anchor, v_self_x || v_anchor);
  execute v_def;
end
$migration$;
