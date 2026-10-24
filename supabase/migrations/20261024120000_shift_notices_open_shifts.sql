-- お知らせの種類（シフト提出のお願い・シフト確定のお知らせ）と対象の期間。マイページでその期間の空きシフト・追加提出へつなぐ
alter table public.therapist_notices
  add column if not exists kind text not null default 'general'
    check (kind in ('general', 'shift_request', 'shift_confirmed')),
  add column if not exists period_start date,
  add column if not exists period_end date;

drop function if exists public.post_therapist_notice(uuid, text, text, text, uuid[], boolean, timestamptz, boolean);

create or replace function public.post_therapist_notice(
  p_store_id uuid,
  p_title text,
  p_body text,
  p_importance text default 'normal',
  p_cast_ids uuid[] default null,
  p_pinned boolean default false,
  p_expires_at timestamptz default null,
  p_notify boolean default true,
  p_kind text default 'general',
  p_period_start date default null,
  p_period_end date default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_targets uuid[];
  v_kind text := case when p_kind in ('shift_request', 'shift_confirmed') then p_kind else 'general' end;
begin
  if p_store_id is null or not public.can_manage_store(p_store_id) then
    raise exception 'この店舗のお知らせは出せません' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'タイトルを入れてください' using errcode = '22023';
  end if;
  if v_kind <> 'general' and (p_period_start is null or p_period_end is null or p_period_end < p_period_start
      or p_period_end - p_period_start > 62) then
    raise exception 'シフトの期間を選んでください' using errcode = '22023';
  end if;
  v_targets := case when coalesce(array_length(p_cast_ids, 1), 0) = 0 then null else p_cast_ids end;
  if v_targets is not null and exists (
    select 1 from unnest(v_targets) as target(id)
    where not exists (select 1 from public.casts where casts.id = target.id and casts.store_id = p_store_id)
  ) then
    raise exception '別の店舗のセラピストは選べません' using errcode = '42501';
  end if;

  insert into public.therapist_notices (store_id, title, body, importance, target_cast_ids, pinned, expires_at, created_by,
    kind, period_start, period_end)
  values (p_store_id, left(trim(p_title), 80), left(coalesce(p_body, ''), 2000),
    case when p_importance = 'important' then 'important' else 'normal' end,
    v_targets, coalesce(p_pinned, false), p_expires_at, auth.uid(),
    v_kind, case when v_kind = 'general' then null else p_period_start end, case when v_kind = 'general' then null else p_period_end end)
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

revoke all on function public.post_therapist_notice(uuid, text, text, text, uuid[], boolean, timestamptz, boolean, text, date, date) from public, anon;
grant execute on function public.post_therapist_notice(uuid, text, text, text, uuid[], boolean, timestamptz, boolean, text, date, date) to authenticated;

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
    'kind', notice.kind,
    'period_start', notice.period_start,
    'period_end', notice.period_end,
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

-- マイページ：期間のルームと出勤（ほかの人の名前は返さない。自分のものだけ mine = true）
create or replace function public.get_therapist_shift_board(p_token text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_cast public.casts;
begin
  select * into v_cast from public.casts
  where access_token = p_token and coalesce(p_token, '') <> '' and is_active;
  if v_cast.id is null then
    raise exception 'マイページのURLが正しくありません' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception '期間が正しくありません' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'rooms', coalesce((
      select jsonb_agg(room.name order by room.name)
      from public.rooms as room
      where room.store_id = v_cast.store_id and room.is_active and room.show_in_therapist_portal
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', shift.shift_date,
        'room', shift.room,
        'start', shift.start_time,
        'end', shift.end_time,
        'mine', shift.cast_id = v_cast.id,
        'approval', shift.approval_status
      ) order by shift.shift_date, shift.start_time)
      from public.shifts as shift
      where shift.store_id = v_cast.store_id
        and shift.shift_date between p_from and p_to
        and coalesce(shift.approval_status, '') <> 'rejected'
        and coalesce(shift.status, '') <> 'cancelled'
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_therapist_shift_board(text, date, date) from public;
grant execute on function public.get_therapist_shift_board(text, date, date) to anon, authenticated;
