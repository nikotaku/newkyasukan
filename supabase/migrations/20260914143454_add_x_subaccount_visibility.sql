-- Xのサブアカウントをセラピストごとに保存し、公開HPに表示するかを管理する。

alter table public.casts
  add column if not exists x_sub_account text,
  add column if not exists x_sub_account_visible boolean not null default false;

comment on column public.casts.x_sub_account is 'セラピストXサブアカウントの公開プロフィールURL';
comment on column public.casts.x_sub_account_visible is 'Xサブアカウントを公開HPへ表示するか';

create or replace function public.get_sns_connection_overview_v9(p_store_id uuid)
returns table(
  cast_id uuid,
  cast_name text,
  photo text,
  o2_created boolean,
  o2_linkage_requested boolean,
  profile_url text,
  credential_configured boolean,
  login_id text,
  o2_login_email text,
  x_profile_url text,
  x_credential_configured boolean,
  x_password_configured boolean,
  x_login_id text,
  x_ff_completed boolean,
  x_list_added boolean,
  x_sub_account text,
  x_sub_account_visible boolean,
  estama_profile_url text,
  estama_credential_configured boolean,
  estama_login_id text,
  last_o2_status text,
  last_o2_error text,
  last_posted_at timestamptz,
  settings_updated_at timestamptz,
  settings_version bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using
      message = 'この店舗を管理する権限がありません',
      errcode = '42501';
  end if;

  return query
  select overview.cast_id,
         overview.cast_name,
         overview.photo,
         overview.o2_created,
         overview.o2_linkage_requested,
         overview.profile_url,
         overview.credential_configured,
         overview.login_id,
         overview.o2_login_email,
         overview.x_profile_url,
         overview.x_credential_configured,
         overview.x_password_configured,
         overview.x_login_id,
         overview.x_ff_completed,
         overview.x_list_added,
         c.x_sub_account,
         coalesce(c.x_sub_account_visible, false),
         overview.estama_profile_url,
         overview.estama_credential_configured,
         overview.estama_login_id,
         overview.last_o2_status,
         overview.last_o2_error,
         overview.last_posted_at,
         overview.settings_updated_at,
         overview.settings_version
  from public.get_sns_connection_overview_v8(p_store_id) overview
  join public.casts c
    on c.id = overview.cast_id
   and c.store_id = p_store_id
  order by c.display_order nulls last, overview.cast_name;
end;
$$;

create or replace function public.save_sns_connection_admin_v9(
  p_store_id uuid,
  p_cast_id uuid,
  p_login_id text,
  p_password text,
  p_o2_login_email text,
  p_x_login_id text,
  p_x_password text,
  p_delete_x_password boolean,
  p_x_ff_completed boolean,
  p_x_list_added boolean,
  p_x_sub_login_id text,
  p_x_sub_account_visible boolean,
  p_estama_login_id text,
  p_estama_password text,
  p_estama_profile_url text,
  p_o2_created boolean,
  p_o2_linkage_requested boolean,
  p_expected_settings_version bigint
)
returns table(
  settings_updated_at timestamptz,
  settings_version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x_sub_login_id text := nullif(regexp_replace(trim(coalesce(p_x_sub_login_id, '')), '^@', ''), '');
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using
      message = 'この店舗を管理する権限がありません',
      errcode = '42501';
  end if;

  if v_x_sub_login_id is not null and v_x_sub_login_id !~ '^[A-Za-z0-9_]+$' then
    raise exception using
      message = 'Xのサブ垢IDは半角英数字とアンダーバーで入力してください',
      errcode = '22023';
  end if;

  -- v8が資格情報の検証・楽観ロック・設定バージョン更新をまとめて行う。
  perform *
  from public.save_sns_connection_admin_v8(
    p_store_id,
    p_cast_id,
    p_login_id,
    p_password,
    p_o2_login_email,
    p_x_login_id,
    p_x_password,
    p_delete_x_password,
    p_x_ff_completed,
    p_x_list_added,
    p_estama_login_id,
    p_estama_password,
    p_estama_profile_url,
    p_o2_created,
    p_o2_linkage_requested,
    p_expected_settings_version
  );

  return query
  update public.casts c
  set x_sub_account = case
        when v_x_sub_login_id is null then null
        else 'https://x.com/' || v_x_sub_login_id
      end,
      x_sub_account_visible = v_x_sub_login_id is not null and coalesce(p_x_sub_account_visible, false)
  where c.id = p_cast_id
    and c.store_id = p_store_id
  returning c.sns_settings_updated_at,
            c.sns_settings_version;
end;
$$;

revoke all on function public.get_sns_connection_overview_v9(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_sns_connection_admin_v9(
  uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, text, boolean, text, text, text, boolean, boolean, bigint
) from public, anon, authenticated, service_role;

grant execute on function public.get_sns_connection_overview_v9(uuid)
  to authenticated;
grant execute on function public.save_sns_connection_admin_v9(
  uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, text, boolean, text, text, text, boolean, boolean, bigint
) to authenticated;
