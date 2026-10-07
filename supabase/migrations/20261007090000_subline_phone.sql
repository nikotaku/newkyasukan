-- 電話（SUBLINE）連携：IVRyから乗り換えた050番号アプリ SUBLINE を管理画面とつなぐ。
-- SUBLINEには汎用のAPIが無く、使えるのは「メンバー一覧（050番号・外部連携のオン/オフ）」と
-- 「スマホのSUBLINEアプリへ発信の通知を送る（push-call）」だけ（公式kintoneプラグインと同じ呼び方）。
-- アクセストークンは Vault（subline_token:<store_id>）にだけ入れ、画面には「登録済み」しか返さない。
-- 呼び出しは Edge Function subline（ログイン中のスタッフのJWTで店舗を確かめる）。

create table if not exists public.subline_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  -- パソコンから発信するときに通知を送るメンバー（SUBLINEの account_code）
  member_account_code text,
  member_name text,
  member_number text,
  token_set_at timestamptz,
  last_checked_at timestamptz,
  last_check_ok boolean,
  last_check_message text,
  updated_at timestamptz not null default now()
);

alter table public.subline_settings enable row level security;
revoke all on public.subline_settings from anon, authenticated;

create or replace function private.subline_token_name(p_store_id uuid)
returns text language sql immutable set search_path = '' as $$
  select 'subline_token:' || p_store_id::text
$$;
revoke all on function private.subline_token_name(uuid) from public, anon, authenticated;

-- 管理画面：設定の読み込み（トークンは「登録済み」かどうかだけ）
create or replace function public.get_subline_settings(p_store_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_store_id not in (select public.current_store_ids()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'token_registered', exists (
        select 1 from vault.decrypted_secrets
        where name = private.subline_token_name(p_store_id) and coalesce(decrypted_secret, '') <> ''
      ),
      'can_manage', public.can_manage_store(p_store_id),
      'token_set_at', s.token_set_at,
      'member_account_code', s.member_account_code,
      'member_name', s.member_name,
      'member_number', s.member_number,
      'last_checked_at', s.last_checked_at,
      'last_check_ok', s.last_check_ok,
      'last_check_message', s.last_check_message
    )
    from (select p_store_id as store_id) k
    left join public.subline_settings s on s.store_id = k.store_id
  );
end;
$$;

-- 管理画面：アクセストークンの登録・差し替え（店長・オーナーのみ）
create or replace function public.save_subline_token(p_store_id uuid, p_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_name text := private.subline_token_name(p_store_id);
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_token !~ '^[A-Za-z0-9_-]{20,200}$' then
    raise exception 'SUBLINEのアクセストークンの形ではありません' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_token, v_name, 'SUBLINE access token');
  else
    perform vault.update_secret(v_id, v_token, v_name, 'SUBLINE access token');
  end if;
  insert into public.subline_settings (store_id, token_set_at, last_checked_at, last_check_ok, last_check_message)
  values (p_store_id, now(), null, null, null)
  on conflict (store_id) do update set
    token_set_at = now(), last_checked_at = null, last_check_ok = null, last_check_message = null, updated_at = now();
end;
$$;

-- 管理画面：連携をやめる（Vault の値を空にする。空のトークンは「未登録」扱い）
create or replace function public.clear_subline_token(p_store_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v_id from vault.secrets where name = private.subline_token_name(p_store_id);
  if v_id is not null then
    perform vault.update_secret(v_id, '', private.subline_token_name(p_store_id), 'SUBLINE access token (cleared)');
  end if;
  update public.subline_settings set token_set_at = null, last_checked_at = null, last_check_ok = null,
    last_check_message = null, updated_at = now()
  where store_id = p_store_id;
end;
$$;

-- 管理画面：パソコンから発信するときの通知先メンバー（店長・オーナーのみ）
create or replace function public.set_subline_member(p_store_id uuid, p_account_code text, p_name text, p_number text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.subline_settings (store_id, member_account_code, member_name, member_number)
  values (p_store_id, nullif(btrim(p_account_code), ''), nullif(btrim(p_name), ''), nullif(btrim(p_number), ''))
  on conflict (store_id) do update set
    member_account_code = excluded.member_account_code,
    member_name = excluded.member_name,
    member_number = excluded.member_number,
    updated_at = now();
end;
$$;

-- Edge Function（service_role）：トークンと通知先を読む
create or replace function public.get_subline_connection(p_store_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', (select nullif(decrypted_secret, '') from vault.decrypted_secrets where name = private.subline_token_name(p_store_id)),
    'member_account_code', (select member_account_code from public.subline_settings where store_id = p_store_id)
  )
$$;

-- Edge Function（service_role）：接続確認の結果を残す
create or replace function public.record_subline_check(p_store_id uuid, p_ok boolean, p_message text)
returns void
language sql security definer set search_path = '' as $$
  insert into public.subline_settings (store_id, last_checked_at, last_check_ok, last_check_message)
  values (p_store_id, now(), p_ok, left(p_message, 300))
  on conflict (store_id) do update set
    last_checked_at = now(), last_check_ok = p_ok, last_check_message = left(p_message, 300), updated_at = now()
$$;

revoke all on function public.get_subline_settings(uuid) from public, anon;
grant execute on function public.get_subline_settings(uuid) to authenticated;
revoke all on function public.save_subline_token(uuid, text) from public, anon;
grant execute on function public.save_subline_token(uuid, text) to authenticated;
revoke all on function public.clear_subline_token(uuid) from public, anon;
grant execute on function public.clear_subline_token(uuid) to authenticated;
revoke all on function public.set_subline_member(uuid, text, text, text) from public, anon;
grant execute on function public.set_subline_member(uuid, text, text, text) to authenticated;
revoke all on function public.get_subline_connection(uuid) from public, anon, authenticated;
grant execute on function public.get_subline_connection(uuid) to service_role;
revoke all on function public.record_subline_check(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_subline_check(uuid, boolean, text) to service_role;
