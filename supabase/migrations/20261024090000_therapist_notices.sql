-- お店からセラピストへのお知らせ（掲示板）。管理画面で書く → マイページの「お知らせ」に出て、スマホ通知も送る
alter table public.therapist_notifications drop constraint therapist_notifications_kind_check;
alter table public.therapist_notifications add constraint therapist_notifications_kind_check
  check (kind = any (array['new', 'changed', 'cancelled', 'sns_ready', 'settlement', 'photo_review', 'notice']));

create table if not exists public.therapist_notices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  -- normal ＝ お知らせ / important ＝ 大事（赤で目立たせる）
  importance text not null default 'normal' check (importance in ('normal', 'important')),
  -- 空なら在籍している全員。決めた人だけに出すときはその cast_id
  target_cast_ids uuid[],
  pinned boolean not null default false,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists therapist_notices_store_idx on public.therapist_notices (store_id, created_at desc);

-- 「確認しました」を押した記録
create table if not exists public.therapist_notice_reads (
  notice_id uuid not null references public.therapist_notices(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, cast_id)
);

alter table public.therapist_notices enable row level security;
alter table public.therapist_notice_reads enable row level security;
revoke all on public.therapist_notices from anon;
revoke all on public.therapist_notice_reads from anon;
grant select, update on public.therapist_notices to authenticated;
grant select on public.therapist_notice_reads to authenticated;
create policy therapist_notices_manage_select on public.therapist_notices
  for select to authenticated using (public.can_manage_store(store_id));
create policy therapist_notices_manage_update on public.therapist_notices
  for update to authenticated using (public.can_manage_store(store_id)) with check (public.can_manage_store(store_id));
create policy therapist_notice_reads_manage_select on public.therapist_notice_reads
  for select to authenticated using (public.can_manage_store(store_id));

-- お店がお知らせを出す（p_notify ならマイページへスマホ通知も送る）
create or replace function public.post_therapist_notice(
  p_store_id uuid,
  p_title text,
  p_body text,
  p_importance text default 'normal',
  p_cast_ids uuid[] default null,
  p_pinned boolean default false,
  p_expires_at timestamptz default null,
  p_notify boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_targets uuid[];
begin
  if p_store_id is null or not public.can_manage_store(p_store_id) then
    raise exception 'この店舗のお知らせは出せません' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'タイトルを入れてください' using errcode = '22023';
  end if;
  v_targets := case when coalesce(array_length(p_cast_ids, 1), 0) = 0 then null else p_cast_ids end;
  if v_targets is not null and exists (
    select 1 from unnest(v_targets) as target(id)
    where not exists (select 1 from public.casts where casts.id = target.id and casts.store_id = p_store_id)
  ) then
    raise exception '別の店舗のセラピストは選べません' using errcode = '42501';
  end if;

  insert into public.therapist_notices (store_id, title, body, importance, target_cast_ids, pinned, expires_at, created_by)
  values (p_store_id, left(trim(p_title), 80), left(coalesce(p_body, ''), 2000),
    case when p_importance = 'important' then 'important' else 'normal' end,
    v_targets, coalesce(p_pinned, false), p_expires_at, auth.uid())
  returning id into v_id;

  if coalesce(p_notify, true) then
    insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, source, available_at, snapshot)
    select p_store_id, cast_record.id, null, 'notice', 'manual', now(),
      jsonb_build_object('notice_id', v_id, 'title', left(trim(p_title), 80),
        'body', left(coalesce(p_body, ''), 500),
        'importance', case when p_importance = 'important' then 'important' else 'normal' end)
    from public.casts as cast_record
    where cast_record.store_id = p_store_id
      and cast_record.is_active
      and cast_record.access_token is not null
      and (v_targets is null or cast_record.id = any (v_targets));
    perform private.dispatch_therapist_notifications();
  end if;
  return v_id;
end;
$function$;

revoke all on function public.post_therapist_notice(uuid, text, text, text, uuid[], boolean, timestamptz, boolean) from public, anon;
grant execute on function public.post_therapist_notice(uuid, text, text, text, uuid[], boolean, timestamptz, boolean) to authenticated;

-- マイページ：本人あてのお知らせ（消した・期限切れ・入店前のものは出さない。新しい順、ピン留めが先）
create or replace function public.get_therapist_notices(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', notice.id,
    'title', notice.title,
    'body', notice.body,
    'importance', notice.importance,
    'pinned', notice.pinned,
    'created_at', notice.created_at,
    'read_at', reads.read_at
  ) order by notice.pinned desc, notice.created_at desc), '[]'::jsonb)
  from public.casts as cast_record
  join public.therapist_notices as notice on notice.store_id = cast_record.store_id
  left join public.therapist_notice_reads as reads on reads.notice_id = notice.id and reads.cast_id = cast_record.id
  where cast_record.access_token = p_token and coalesce(p_token, '') <> ''
    and cast_record.is_active
    and notice.deleted_at is null
    and (notice.expires_at is null or notice.expires_at > now())
    and (notice.target_cast_ids is null or cast_record.id = any (notice.target_cast_ids))
    and notice.created_at > now() - interval '180 days';
$function$;

revoke all on function public.get_therapist_notices(text) from public;
grant execute on function public.get_therapist_notices(text) to anon, authenticated;

-- マイページ：「確認しました」
create or replace function public.mark_therapist_notice_read(p_token text, p_notice_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cast public.casts;
  v_read_at timestamptz;
begin
  select * into v_cast from public.casts
  where access_token = p_token and coalesce(p_token, '') <> '' and is_active;
  if v_cast.id is null or not exists (
    select 1 from public.therapist_notices as notice
    where notice.id = p_notice_id and notice.store_id = v_cast.store_id and notice.deleted_at is null
      and (notice.target_cast_ids is null or v_cast.id = any (notice.target_cast_ids))
  ) then
    raise exception 'お知らせが見つかりません' using errcode = '42501';
  end if;
  insert into public.therapist_notice_reads (notice_id, cast_id, store_id)
  values (p_notice_id, v_cast.id, v_cast.store_id)
  on conflict (notice_id, cast_id) do nothing;
  select read_at into v_read_at from public.therapist_notice_reads where notice_id = p_notice_id and cast_id = v_cast.id;
  return v_read_at;
end;
$function$;

revoke all on function public.mark_therapist_notice_read(text, uuid) from public;
grant execute on function public.mark_therapist_notice_read(text, uuid) to anon, authenticated;
