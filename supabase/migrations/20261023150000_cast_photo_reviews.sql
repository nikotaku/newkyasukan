-- 加工した写真をセラピストに確認してもらう（スタッフ画面の写真タブ「セラピストに確認を取る」→ マイページ）
alter table public.therapist_notifications drop constraint therapist_notifications_kind_check;
alter table public.therapist_notifications add constraint therapist_notifications_kind_check
  check (kind = any (array['new', 'changed', 'cancelled', 'sns_ready', 'settlement', 'photo_review']));

create table if not exists public.cast_photo_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  -- [{ url, answer: null | 'ok' | 'change', note }]
  photos jsonb not null default '[]'::jsonb,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'cancelled')),
  response_note text,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists cast_photo_reviews_cast_idx on public.cast_photo_reviews (cast_id, requested_at desc);

alter table public.cast_photo_reviews enable row level security;
revoke all on public.cast_photo_reviews from anon;
grant select on public.cast_photo_reviews to authenticated;
create policy cast_photo_reviews_manage_select on public.cast_photo_reviews
  for select to authenticated using (public.can_manage_store(store_id));

-- お店から確認を頼む（前のまだ返事の無い依頼は取り消す）
create or replace function public.request_cast_photo_review(p_cast_id uuid, p_photos text[], p_message text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cast public.casts;
  v_id uuid;
  v_photos jsonb;
begin
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or not public.can_manage_store(v_cast.store_id) then
    raise exception 'このセラピストは操作できません' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('url', url, 'answer', null, 'note', null) order by ord), '[]'::jsonb)
    into v_photos
  from unnest(p_photos) with ordinality as photo(url, ord)
  where coalesce(url, '') ~ '^https://';
  if jsonb_array_length(v_photos) = 0 then
    raise exception '確認してもらう写真を選んでください' using errcode = '22023';
  end if;
  if jsonb_array_length(v_photos) > 40 then
    raise exception '一度に送れるのは40枚までです' using errcode = '22023';
  end if;

  update public.cast_photo_reviews set status = 'cancelled'
  where cast_id = v_cast.id and status = 'pending';

  insert into public.cast_photo_reviews (store_id, cast_id, photos, message, requested_by)
  values (v_cast.store_id, v_cast.id, v_photos, nullif(trim(coalesce(p_message, '')), ''), auth.uid())
  returning id into v_id;

  insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, source, available_at, snapshot)
  values (v_cast.store_id, v_cast.id, null, 'photo_review', 'manual', now(),
    jsonb_build_object('review_id', v_id, 'count', jsonb_array_length(v_photos)));
  perform private.dispatch_therapist_notifications();
  return v_id;
end;
$function$;

revoke all on function public.request_cast_photo_review(uuid, text[], text) from public, anon;
grant execute on function public.request_cast_photo_review(uuid, text[], text) to authenticated;

-- マイページ：いちばん新しい確認依頼（取り消したものと30日より前のものは出さない）
create or replace function public.get_therapist_photo_review(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'id', review.id,
    'photos', review.photos,
    'message', review.message,
    'status', review.status,
    'response_note', review.response_note,
    'requested_at', review.requested_at,
    'responded_at', review.responded_at
  )
  from public.casts as cast_record
  join public.cast_photo_reviews as review on review.cast_id = cast_record.id
  where cast_record.access_token = p_token and coalesce(p_token, '') <> ''
    and review.status <> 'cancelled'
    and review.requested_at > now() - interval '30 days'
  order by review.requested_at desc
  limit 1;
$function$;

revoke all on function public.get_therapist_photo_review(text) from public;
grant execute on function public.get_therapist_photo_review(text) to anon, authenticated;

-- マイページから返事（写真ごとに OK／直してほしい＋ひとこと）
create or replace function public.respond_therapist_photo_review(p_token text, p_review_id uuid, p_answers jsonb, p_note text default null)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_review public.cast_photo_reviews;
  v_photos jsonb;
  v_status text;
begin
  select review.* into v_review
  from public.cast_photo_reviews as review
  join public.casts as cast_record on cast_record.id = review.cast_id
  where review.id = p_review_id
    and cast_record.access_token = p_token and coalesce(p_token, '') <> ''
  for update of review;
  if v_review.id is null then
    raise exception '確認依頼が見つかりません' using errcode = '42501';
  end if;
  if v_review.status <> 'pending' then
    raise exception 'この確認依頼はもう返事済みか、取り消されています' using errcode = '22023';
  end if;

  -- 写真の並びはお店が送ったまま。返事は url で合わせる
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'url', photo.value->>'url',
      'answer', case when answer.value->>'answer' in ('ok', 'change') then answer.value->>'answer' else 'ok' end,
      'note', nullif(left(trim(coalesce(answer.value->>'note', '')), 300), '')
    ) order by photo.ordinality
  ), '[]'::jsonb)
  into v_photos
  from jsonb_array_elements(v_review.photos) with ordinality as photo(value, ordinality)
  left join lateral (
    select item.value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as item(value)
    where item.value->>'url' = photo.value->>'url'
    limit 1
  ) as answer on true;

  v_status := case
    when exists (select 1 from jsonb_array_elements(v_photos) as item(value) where item.value->>'answer' = 'change')
    then 'changes_requested' else 'approved' end;

  update public.cast_photo_reviews
  set photos = v_photos,
      status = v_status,
      response_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
      responded_at = now()
  where id = v_review.id;
  return v_status;
end;
$function$;

revoke all on function public.respond_therapist_photo_review(text, uuid, jsonb, text) from public;
grant execute on function public.respond_therapist_photo_review(text, uuid, jsonb, text) to anon, authenticated;
