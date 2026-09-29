-- 店舗の投稿先（X の各アカウント・その他の媒体）。SNS連携管理の「店舗の投稿先」で登録し、
-- どの投稿がどこへ行くか・エラーで止まっていないかを一か所で見る。O2 の店舗アカウントは既存の
-- o2_store_availability_settings / store_site_credentials（site = 'o2'）をそのまま使う。
-- キー・パスワードは Vault（名前は store_post_channel:<id>:<項目>）に入れ、この表には置かない。

create table public.store_post_channels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  platform text not null check (platform in ('x', 'other')),
  -- X は運用表のアカウント（shukyaku / kyujin / tencho など）。その他は自由な識別子
  account_key text not null check (length(btrim(account_key)) > 0),
  label text not null check (length(btrim(label)) > 0),
  handle text, -- X の @ID（キーの確認で自動で入る）。その他は公開ページの URL
  login_url text,
  login_id text,
  note text, -- 何を投稿している先か
  auto_post boolean not null default false, -- X：決まった形の投稿を自動で出す
  paused_at timestamptz, -- 失敗が続いたので自動投稿を止めた時刻（再開で null）
  pause_reason text,
  verified_at timestamptz, -- キーの確認に成功した時刻
  last_success_at timestamptz,
  last_post_url text,
  last_error text,
  last_error_at timestamptz,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, platform, account_key)
);

alter table public.store_post_channels enable row level security;
revoke all on public.store_post_channels from anon, authenticated;
grant select on public.store_post_channels to authenticated;
create policy store_post_channels_member_read on public.store_post_channels for select to authenticated
  using (store_id in (select public.current_store_ids()));

-- 自動投稿の結果を「今日の投稿」の行に残す
alter table public.x_daily_posts
  add column publish_status text check (publish_status in ('posting', 'posted', 'failed', 'skipped')),
  add column channel_id uuid references public.store_post_channels(id) on delete set null,
  add column tweet_id text,
  add column post_url text,
  add column error_message text,
  add column attempts integer not null default 0,
  add column last_attempt_at timestamptz;

-- Vault の出し入れ（この migration の関数からだけ使う）
create or replace function private.store_post_secret_name(p_channel_id uuid, p_field text)
returns text language sql immutable set search_path = '' as $$
  select 'store_post_channel:' || p_channel_id::text || ':' || p_field
$$;

create or replace function private.store_post_set_secret(p_channel_id uuid, p_field text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.store_post_secret_name(p_channel_id, p_field);
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_value, v_name, 'store_post_channels');
  else
    perform vault.update_secret(v_id, p_value, v_name, 'store_post_channels');
  end if;
end;
$$;

create or replace function private.store_post_has_secret(p_channel_id uuid, p_field text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = private.store_post_secret_name(p_channel_id, p_field)
      and nullif(decrypted_secret, '') is not null
  )
$$;

revoke all on function private.store_post_secret_name(uuid, text) from public, anon, authenticated;
revoke all on function private.store_post_set_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function private.store_post_has_secret(uuid, text) from public, anon, authenticated;

-- 一覧（キーそのものは返さず、登録済みかどうかだけ）
create or replace function public.get_store_post_channels(p_store_id uuid)
returns table (
  id uuid, platform text, account_key text, label text, handle text, login_url text, login_id text, note text,
  auto_post boolean, paused_at timestamptz, pause_reason text, verified_at timestamptz,
  last_success_at timestamptz, last_post_url text, last_error text, last_error_at timestamptz, consecutive_failures integer,
  keys_configured boolean, password_configured boolean, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  return query
  select c.id, c.platform, c.account_key, c.label, c.handle, c.login_url, c.login_id, c.note,
         c.auto_post, c.paused_at, c.pause_reason, c.verified_at,
         c.last_success_at, c.last_post_url, c.last_error, c.last_error_at, c.consecutive_failures,
         (c.platform = 'x'
           and private.store_post_has_secret(c.id, 'api_key') and private.store_post_has_secret(c.id, 'api_secret')
           and private.store_post_has_secret(c.id, 'access_token') and private.store_post_has_secret(c.id, 'access_token_secret')),
         private.store_post_has_secret(c.id, 'password'),
         c.updated_at
  from public.store_post_channels c
  where c.store_id = p_store_id
  order by c.platform, c.created_at;
end;
$$;

-- 登録・更新。p_secrets は空でない値だけ上書きする（空欄なら今のまま）
create or replace function public.save_store_post_channel(
  p_store_id uuid,
  p_channel_id uuid,
  p_platform text,
  p_account_key text,
  p_label text,
  p_handle text default null,
  p_login_url text default null,
  p_login_id text default null,
  p_note text default null,
  p_auto_post boolean default false,
  p_secrets jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_channel_id;
  v_field text;
  v_value text;
  v_secret_changed boolean := false;
  v_allowed text[] := case when p_platform = 'x'
    then array['api_key', 'api_secret', 'access_token', 'access_token_secret']
    else array['password'] end;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  if p_platform not in ('x', 'other') then
    raise exception using message = '投稿先の種類が正しくありません', errcode = '22023';
  end if;

  if v_id is null then
    insert into public.store_post_channels (store_id, platform, account_key, label, handle, login_url, login_id, note, auto_post)
    values (p_store_id, p_platform, btrim(p_account_key), btrim(p_label), nullif(btrim(p_handle), ''),
            nullif(btrim(p_login_url), ''), nullif(btrim(p_login_id), ''), nullif(btrim(p_note), ''), coalesce(p_auto_post, false))
    returning id into v_id;
  else
    update public.store_post_channels
    set account_key = btrim(p_account_key),
        label = btrim(p_label),
        handle = nullif(btrim(p_handle), ''),
        login_url = nullif(btrim(p_login_url), ''),
        login_id = nullif(btrim(p_login_id), ''),
        note = nullif(btrim(p_note), ''),
        auto_post = coalesce(p_auto_post, false),
        updated_at = now()
    where id = v_id and store_id = p_store_id and platform = p_platform;
    if not found then
      raise exception using message = '投稿先が見つかりません', errcode = 'P0002';
    end if;
  end if;

  for v_field, v_value in select key, value from jsonb_each_text(coalesce(p_secrets, '{}'::jsonb)) loop
    if v_field = any (v_allowed) and nullif(btrim(v_value), '') is not null then
      perform private.store_post_set_secret(v_id, v_field, btrim(v_value));
      v_secret_changed := true;
    end if;
  end loop;

  -- キーを入れ直したら、止まっていた自動投稿を再開できる状態に戻す（確認はやり直し）
  if v_secret_changed then
    update public.store_post_channels
    set paused_at = null, pause_reason = null, consecutive_failures = 0, verified_at = null, updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- 自動投稿のオン・オフと、止まったものの再開
create or replace function public.set_store_post_channel_state(p_channel_id uuid, p_auto_post boolean, p_resume boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.store_post_channels where id = p_channel_id;
  if v_store is null or auth.uid() is null or not public.can_manage_store(v_store) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  update public.store_post_channels
  set auto_post = coalesce(p_auto_post, auto_post),
      paused_at = case when p_resume then null else paused_at end,
      pause_reason = case when p_resume then null else pause_reason end,
      consecutive_failures = case when p_resume then 0 else consecutive_failures end,
      updated_at = now()
  where id = p_channel_id;
end;
$$;

create or replace function public.delete_store_post_channel(p_channel_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.store_post_channels where id = p_channel_id;
  if v_store is null or auth.uid() is null or not public.can_manage_store(v_store) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  delete from vault.secrets where name like 'store_post_channel:' || p_channel_id::text || ':%';
  delete from public.store_post_channels where id = p_channel_id;
end;
$$;

-- その他の媒体のパスワードを表示する（X のキーは表示しない）
create or replace function public.reveal_store_post_channel_password(p_channel_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.store_post_channels where id = p_channel_id and platform = 'other';
  if v_store is null or auth.uid() is null or not public.can_manage_store(v_store) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets
          where name = private.store_post_secret_name(p_channel_id, 'password'));
end;
$$;

-- Edge Function（service_role）用：X のキーを読む
create or replace function public.get_store_post_channel_secrets(p_channel_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(split_part(name, ':', 3), decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name like 'store_post_channel:' || p_channel_id::text || ':%'
$$;

-- Edge Function（service_role）用：同じ枠を二重に投稿しないよう、先に「投稿中」を取る
create or replace function public.claim_x_auto_post(
  p_store_id uuid, p_post_date date, p_account_key text, p_slot_key text, p_channel_id uuid, p_max_attempts integer default 2
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_claimed boolean;
begin
  insert into public.x_daily_posts (store_id, post_date, account_key, slot_key, publish_status, channel_id, attempts, last_attempt_at, updated_at)
  values (p_store_id, p_post_date, p_account_key, p_slot_key, 'posting', p_channel_id, 1, now(), now())
  on conflict (store_id, post_date, account_key, slot_key) do update
    set publish_status = 'posting', channel_id = excluded.channel_id,
        attempts = public.x_daily_posts.attempts + 1, last_attempt_at = now(), updated_at = now()
    where public.x_daily_posts.posted_at is null
      and (public.x_daily_posts.publish_status is null
           or public.x_daily_posts.publish_status = 'skipped'
           or (public.x_daily_posts.publish_status = 'failed' and public.x_daily_posts.attempts < p_max_attempts)
           -- 投稿中のまま10分以上たったもの（途中で落ちた）は取り直す
           or (public.x_daily_posts.publish_status = 'posting' and public.x_daily_posts.last_attempt_at < now() - interval '10 minutes'))
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.get_store_post_channels(uuid) from public, anon;
grant execute on function public.get_store_post_channels(uuid) to authenticated;
revoke all on function public.save_store_post_channel(uuid, uuid, text, text, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_store_post_channel(uuid, uuid, text, text, text, text, text, text, text, boolean, jsonb) to authenticated;
revoke all on function public.set_store_post_channel_state(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_store_post_channel_state(uuid, boolean, boolean) to authenticated;
revoke all on function public.delete_store_post_channel(uuid) from public, anon;
grant execute on function public.delete_store_post_channel(uuid) to authenticated;
revoke all on function public.reveal_store_post_channel_password(uuid) from public, anon;
grant execute on function public.reveal_store_post_channel_password(uuid) to authenticated;
revoke all on function public.get_store_post_channel_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_store_post_channel_secrets(uuid) to service_role;
revoke all on function public.claim_x_auto_post(uuid, date, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_x_auto_post(uuid, date, text, text, uuid, integer) to service_role;

-- 定時実行：5分ごと。自動投稿がオンの X アカウントがあるときだけ Edge Function x-auto-post を呼ぶ
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'x_auto_post_internal_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'x_auto_post_internal_secret',
      'Authenticates pg_cron calls to x-auto-post');
  end if;
end;
$$;

create or replace function public.verify_x_auto_post_secret(candidate text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'x_auto_post_internal_secret' and decrypted_secret = candidate)
$$;
revoke all on function public.verify_x_auto_post_secret(text) from public, anon, authenticated;
grant execute on function public.verify_x_auto_post_secret(text) to service_role;

create or replace function private.dispatch_x_auto_post()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_request_id bigint;
begin
  if not exists (select 1 from public.store_post_channels where platform = 'x' and auto_post and paused_at is null) then
    return null;
  end if;
  select net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/x-auto-post',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-auto-post-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'x_auto_post_internal_secret')
    ),
    body := jsonb_build_object('action', 'run'),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_x_auto_post() from public, anon, authenticated;

select cron.schedule('x-auto-post-every-5-minutes', '*/5 * * * *', 'select private.dispatch_x_auto_post();');
