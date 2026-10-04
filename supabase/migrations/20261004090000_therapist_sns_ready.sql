-- セラピストのマイページで、お店が用意した X・O2 のログインID・パスワードを見られるようにする。
-- 管理画面（SNS連携）の「設定完了を通知」で、セラピストのマイページへ通知する
-- （therapist_notifications の kind = 'sns_ready'。届け方は予約通知と同じ：プッシュ → 本人のLINEグループ → 管理画面）。

-- ── お知らせの記録（セラピストごとに最新の1件） ─────────────────────
create table public.therapist_sns_setup_notices (
  cast_id uuid primary key references public.casts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  notified_at timestamptz not null default now(),
  notified_by uuid references auth.users(id) on delete set null,
  seen_at timestamptz
);
create index therapist_sns_setup_notices_store_idx on public.therapist_sns_setup_notices (store_id);

alter table public.therapist_sns_setup_notices enable row level security;
revoke all on public.therapist_sns_setup_notices from anon, authenticated;
grant select on public.therapist_sns_setup_notices to authenticated;
grant all on public.therapist_sns_setup_notices to service_role;

create policy therapist_sns_setup_notices_managers_read on public.therapist_sns_setup_notices
  for select to authenticated
  using ((select public.can_manage_store(store_id)));

-- ── 通知の種類に「SNSアカウントの準備ができた」を足す ─────────────────
alter table public.therapist_notifications drop constraint if exists therapist_notifications_kind_check;
alter table public.therapist_notifications
  add constraint therapist_notifications_kind_check check (kind in ('new', 'changed', 'cancelled', 'sns_ready'));

-- ── 管理画面から：設定完了をセラピストに知らせる ───────────────────────
create or replace function public.notify_therapist_sns_ready(p_cast_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast public.casts;
  v_id uuid;
begin
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or not public.can_manage_store(v_cast.store_id) then
    raise exception 'このセラピストは操作できません' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cast_site_credentials credentials
    where credentials.cast_id = v_cast.id
      and credentials.store_id = v_cast.store_id
      and credentials.site in ('x', 'o2')
      and coalesce(credentials.login_id, '') <> ''
  ) then
    raise exception 'X か O2 のログインIDを先に保存してください' using errcode = '22023';
  end if;

  insert into public.therapist_sns_setup_notices (cast_id, store_id, notified_at, notified_by, seen_at)
  values (v_cast.id, v_cast.store_id, now(), auth.uid(), null)
  on conflict (cast_id) do update set
    store_id = excluded.store_id,
    notified_at = excluded.notified_at,
    notified_by = excluded.notified_by,
    seen_at = null;

  insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, source, available_at)
  values (v_cast.store_id, v_cast.id, null, 'sns_ready', 'manual', now())
  returning id into v_id;
  perform private.dispatch_therapist_notifications();
  return v_id;
end;
$$;
revoke all on function public.notify_therapist_sns_ready(uuid) from public, anon;
grant execute on function public.notify_therapist_sns_ready(uuid) to authenticated;

-- ── マイページから（本人のトークンで） ───────────────────────────────
-- お店が用意した X・O2 のログイン情報と、お知らせの状態
create or replace function public.get_therapist_sns_account(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'notified_at', notice.notified_at,
    'seen_at', notice.seen_at,
    'x', case when x.id is null then null else jsonb_build_object(
      'login_id', x.login_id,
      'password', x.password,
      'profile_url', cast_record.x_account
    ) end,
    'o2', case when o2.id is null then null else jsonb_build_object(
      'login_id', o2.login_id,
      'login_email', cast_record.o2_login_email,
      'password', o2.password,
      'profile_url', cast_record.o2_url
    ) end
  )
  from public.casts as cast_record
  left join public.therapist_sns_setup_notices as notice on notice.cast_id = cast_record.id
  left join public.cast_site_credentials as x
    on x.cast_id = cast_record.id and x.store_id = cast_record.store_id and x.site = 'x'
  left join public.cast_site_credentials as o2
    on o2.cast_id = cast_record.id and o2.store_id = cast_record.store_id and o2.site = 'o2'
  where cast_record.access_token = p_token and coalesce(p_token, '') <> ''
  limit 1;
$$;
revoke all on function public.get_therapist_sns_account(text) from public;
grant execute on function public.get_therapist_sns_account(text) to anon, authenticated;

-- お知らせを見た
create or replace function public.mark_therapist_sns_setup_seen(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.therapist_sns_setup_notices as notice
  set seen_at = now()
  from public.casts as cast_record
  where cast_record.id = notice.cast_id
    and cast_record.access_token = p_token
    and coalesce(p_token, '') <> ''
    and notice.seen_at is null;
  return found;
end;
$$;
revoke all on function public.mark_therapist_sns_setup_seen(text) from public;
grant execute on function public.mark_therapist_sns_setup_seen(text) to anon, authenticated;
