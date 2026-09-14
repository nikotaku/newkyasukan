-- X連携管理でセラピストごとの準備状況を扱えるようにする。
-- 既存の新規登録チェックリスト列を再利用し、専用RPCから安全に参照・更新する。

alter table public.casts
  add column if not exists x_ff_completed boolean not null default false,
  add column if not exists x_list_added boolean not null default false;

comment on column public.casts.x_ff_completed is 'Xの相互フォロー完了';
comment on column public.casts.x_list_added is 'Xのセラピストリスト追加完了';

create or replace function public.get_sns_connection_overview_v8(p_store_id uuid)
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
         coalesce(c.x_ff_completed, false),
         coalesce(c.x_list_added, false),
         overview.estama_profile_url,
         overview.estama_credential_configured,
         overview.estama_login_id,
         overview.last_o2_status,
         overview.last_o2_error,
         overview.last_posted_at,
         overview.settings_updated_at,
         overview.settings_version
  from public.get_sns_connection_overview_v7(p_store_id) overview
  join public.casts c
    on c.id = overview.cast_id
   and c.store_id = p_store_id
  order by c.display_order nulls last, overview.cast_name;
end;
$$;

create or replace function public.save_sns_connection_admin_v8(
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
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using
      message = 'この店舗を管理する権限がありません',
      errcode = '42501';
  end if;

  -- v7が資格情報の検証・楽観ロック・設定バージョン更新をまとめて行う。
  -- 相互フォロー・リスト追加も同じトランザクションで保存する。
  perform *
  from public.save_sns_connection_admin_v7(
    p_store_id,
    p_cast_id,
    p_login_id,
    p_password,
    p_o2_login_email,
    p_x_login_id,
    p_x_password,
    p_delete_x_password,
    p_estama_login_id,
    p_estama_password,
    p_estama_profile_url,
    p_o2_created,
    p_o2_linkage_requested,
    p_expected_settings_version
  );

  return query
  update public.casts c
  set x_ff_completed = coalesce(p_x_ff_completed, false),
      x_list_added = coalesce(p_x_list_added, false)
  where c.id = p_cast_id
    and c.store_id = p_store_id
  returning c.sns_settings_updated_at,
            c.sns_settings_version;
end;
$$;

revoke all on function public.get_sns_connection_overview_v8(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_sns_connection_admin_v8(
  uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, text, text, text, boolean, boolean, bigint
) from public, anon, authenticated, service_role;

grant execute on function public.get_sns_connection_overview_v8(uuid)
  to authenticated;
grant execute on function public.save_sns_connection_admin_v8(
  uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, text, text, text, boolean, boolean, bigint
) to authenticated;
