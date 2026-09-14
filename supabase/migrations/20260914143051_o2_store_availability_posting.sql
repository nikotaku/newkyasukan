-- O2店舗アカウントによる空き情報投稿。
-- セラピスト個人の cast_posts / cast_site_credentials / 魂セラピストとは
-- 意図的に別の資格情報・投稿履歴・スケジュールで管理する。

create table if not exists public.o2_store_availability_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  is_enabled boolean not null default false,
  post_hour_jst smallint not null default 11 check (post_hour_jst between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.o2_store_availability_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  business_date date not null,
  trigger_source text not null default 'scheduled' check (trigger_source in ('scheduled', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'posting', 'posted', 'skipped', 'failed', 'review_required')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  image_url text null check (image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https://[^[:space:]]+$')),
  featured_cast_id uuid null references public.casts(id) on delete set null,
  availability jsonb not null default '[]'::jsonb,
  o2_post_id text null check (o2_post_id is null or o2_post_id ~ '^[0-9]+$'),
  o2_post_url text null,
  error_message text null check (error_message is null or char_length(btrim(error_message)) between 1 and 4000),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  posted_at timestamptz null,
  last_attempt_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint o2_store_availability_posts_one_per_store_day unique (store_id, business_date),
  constraint o2_store_availability_posts_result_consistency check (
    (status = 'posted' and o2_post_id is not null and o2_post_url = 'https://m-sns.net/post/?id=' || o2_post_id and posted_at is not null)
    or (status <> 'posted' and posted_at is null)
  )
);

create index if not exists o2_store_availability_posts_store_created_idx
  on public.o2_store_availability_posts (store_id, created_at desc);
create unique index if not exists o2_store_availability_one_posting_per_store_idx
  on public.o2_store_availability_posts (store_id)
  where status = 'posting';

alter table public.o2_store_availability_settings enable row level security;
alter table public.o2_store_availability_posts enable row level security;

grant select on public.o2_store_availability_settings to authenticated;
grant select on public.o2_store_availability_posts to authenticated;
grant all on public.o2_store_availability_settings to service_role;
grant all on public.o2_store_availability_posts to service_role;
revoke all on public.o2_store_availability_settings from anon;
revoke all on public.o2_store_availability_posts from anon;

drop policy if exists "o2_store_availability_settings_manage" on public.o2_store_availability_settings;
create policy "o2_store_availability_settings_manage"
on public.o2_store_availability_settings
for select to authenticated
using (public.can_manage_store(store_id));

drop policy if exists "o2_store_availability_posts_manage" on public.o2_store_availability_posts;
create policy "o2_store_availability_posts_manage"
on public.o2_store_availability_posts
for select to authenticated
using (public.can_manage_store(store_id));

drop trigger if exists update_o2_store_availability_settings_updated_at on public.o2_store_availability_settings;
create trigger update_o2_store_availability_settings_updated_at
before update on public.o2_store_availability_settings
for each row execute function public.update_updated_at_column();

drop trigger if exists update_o2_store_availability_posts_updated_at on public.o2_store_availability_posts;
create trigger update_o2_store_availability_posts_updated_at
before update on public.o2_store_availability_posts
for each row execute function public.update_updated_at_column();

-- 管理画面は店舗資格情報そのものを直接読まず、この関数で設定状態だけを読み取る。
create or replace function public.get_o2_store_availability_settings_v1(p_store_id uuid)
returns table(
  login_email text,
  credential_configured boolean,
  is_enabled boolean,
  post_hour_jst smallint,
  last_status text,
  last_posted_at timestamptz,
  last_error text,
  last_post_url text,
  last_business_date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'この店舗を管理する権限がありません';
  end if;

  return query
  select
    credentials.login_id,
    (credentials.login_id is not null and credentials.password is not null),
    coalesce(settings.is_enabled, false),
    coalesce(settings.post_hour_jst, 11)::smallint,
    recent.status,
    recent.posted_at,
    recent.error_message,
    recent.o2_post_url,
    recent.business_date
  from (select p_store_id as store_id) as target
  left join public.store_site_credentials as credentials
    on credentials.store_id = target.store_id
   and credentials.site = 'o2'
  left join public.o2_store_availability_settings as settings
    on settings.store_id = target.store_id
  left join lateral (
    select posts.status, posts.posted_at, posts.error_message, posts.o2_post_url, posts.business_date
    from public.o2_store_availability_posts as posts
    where posts.store_id = target.store_id
    order by posts.business_date desc, posts.created_at desc
    limit 1
  ) as recent on true;
end;
$$;

-- 初回はメールアドレスとパスワードが必須。以降はパスワードを空欄のまま保存すると既存値を維持する。
create or replace function public.save_o2_store_availability_settings_v1(
  p_store_id uuid,
  p_login_email text,
  p_password text,
  p_is_enabled boolean
)
returns table(
  credential_configured boolean,
  is_enabled boolean,
  post_hour_jst smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login_email text := nullif(btrim(coalesce(p_login_email, '')), '');
  v_password text := nullif(coalesce(p_password, ''), '');
  v_existing_login text;
  v_existing_password text;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'この店舗を管理する権限がありません';
  end if;
  if p_is_enabled is null then
    raise exception '自動投稿の設定を確認してください';
  end if;
  if v_login_email is not null and (
    char_length(v_login_email) > 512
    or v_login_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'O2店舗ログインのメールアドレスを確認してください';
  end if;
  if v_password is not null and char_length(v_password) > 4096 then
    raise exception 'パスワードは4096文字以内で入力してください';
  end if;

  select credentials.login_id, credentials.password
    into v_existing_login, v_existing_password
  from public.store_site_credentials as credentials
  where credentials.store_id = p_store_id and credentials.site = 'o2';

  v_login_email := coalesce(v_login_email, v_existing_login);
  v_password := coalesce(v_password, v_existing_password);
  if v_login_email is null or v_password is null then
    raise exception 'O2店舗ログインのメールアドレスとパスワードを入力してください';
  end if;

  insert into public.store_site_credentials (store_id, site, login_id, password, login_url)
  values (p_store_id, 'o2', v_login_email, v_password, 'https://m-sns.net/shop/login/')
  on conflict (store_id, site) do update
  set login_id = excluded.login_id,
      password = excluded.password,
      login_url = excluded.login_url,
      updated_at = now();

  insert into public.o2_store_availability_settings (store_id, is_enabled, post_hour_jst)
  values (p_store_id, p_is_enabled, 11)
  on conflict (store_id) do update
  set is_enabled = excluded.is_enabled,
      updated_at = now();

  return query
  select true, p_is_enabled, 11::smallint;
end;
$$;

-- 期限付きの一回限りトークンだけで、DBスケジューラからVercelの実行APIを呼び出す。
-- クレデンシャルや固定共有シークレットをリクエストへ入れない。
create table if not exists private.o2_store_availability_run_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

revoke all on table private.o2_store_availability_run_tokens from public, anon, authenticated;

alter table private.o2_store_availability_run_tokens enable row level security;

create or replace function private.dispatch_o2_store_availability_post()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  if not exists (
    select 1
    from public.o2_store_availability_settings as settings
    join public.store_site_credentials as credentials
      on credentials.store_id = settings.store_id
     and credentials.site = 'o2'
    where settings.is_enabled
      and nullif(btrim(credentials.login_id), '') is not null
      and nullif(credentials.password, '') is not null
  ) then
    return null;
  end if;

  delete from private.o2_store_availability_run_tokens
  where expires_at < now() - interval '1 day';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.o2_store_availability_run_tokens (token_hash, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '15 minutes');

  select net.http_post(
    url := 'https://enka-salon.jp/api/cron/o2-store-availability',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('token', v_token),
    timeout_milliseconds := 300000
  ) into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.claim_o2_store_availability_run_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  with claimed as (
    delete from private.o2_store_availability_run_tokens as token_row
    where token_row.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and token_row.expires_at > now()
      and token_row.used_at is null
    returning 1
  )
  select exists(select 1 from claimed) into v_claimed;

  return v_claimed;
end;
$$;

revoke all on function public.get_o2_store_availability_settings_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_o2_store_availability_settings_v1(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_o2_store_availability_run_token(text)
  from public, anon, authenticated;
revoke all on function private.dispatch_o2_store_availability_post()
  from public, anon, authenticated;
grant execute on function public.get_o2_store_availability_settings_v1(uuid) to authenticated;
grant execute on function public.save_o2_store_availability_settings_v1(uuid, text, text, boolean) to authenticated;
grant execute on function public.claim_o2_store_availability_run_token(text) to service_role;
grant execute on function private.dispatch_o2_store_availability_post() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'o2-store-availability-daily';

select cron.schedule(
  'o2-store-availability-daily',
  '5 2 * * *',
  $cron$select private.dispatch_o2_store_availability_post();$cron$
);
