-- セラピスト本人がマイページでプロフィール（インタビュー）を入力し、お店が確認して反映する。
-- 本人の入力は casts に直接書かず、提出（cast_profile_submissions）として残す。お店がスタッフ画面で「反映」すると casts に入る。

create table if not exists public.cast_profile_submissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  fields jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists cast_profile_submissions_pending_idx
  on public.cast_profile_submissions (store_id, status, submitted_at desc);

alter table public.cast_profile_submissions enable row level security;

create policy cast_profile_submissions_staff on public.cast_profile_submissions
  for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

revoke all on public.cast_profile_submissions from anon;
revoke all on public.cast_profile_submissions from authenticated;
grant select, update on public.cast_profile_submissions to authenticated;

-- 本人が入れられる項目（公開プロフィールのインタビュー部分だけ）
create or replace function public.therapist_profile_field_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'age', 'height', 'bust', 'waist', 'hip', 'cup_size', 'therapist_experience',
    'favorite_techniques', 'favorite_food', 'ideal_type', 'celebrity_lookalike',
    'day_off_activities', 'hobbies', 'therapist_comment'
  ];
$$;

-- マイページ：いまのプロフィールと、確認待ちの提出
create or replace function public.get_therapist_profile_form(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select c.*
    from public.casts c
    where p_token is not null and length(p_token) between 8 and 200
      and c.access_token = p_token and c.is_active
    limit 1
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'current', (
      select jsonb_build_object(
        'age', m.age, 'height', m.height, 'bust', m.bust, 'waist', m.waist, 'hip', m.hip,
        'cup_size', coalesce(m.cup_size, m.bust_size), 'therapist_experience', m.therapist_experience,
        'favorite_techniques', m.favorite_techniques, 'favorite_food', m.favorite_food,
        'ideal_type', m.ideal_type, 'celebrity_lookalike', m.celebrity_lookalike,
        'day_off_activities', m.day_off_activities, 'hobbies', coalesce(m.hobbies, m.hobby),
        'therapist_comment', coalesce(m.therapist_comment, m.profile)
      ) from me m
    ),
    'pending', (
      select jsonb_build_object('fields', s.fields, 'submitted_at', s.submitted_at)
      from public.cast_profile_submissions s join me m on m.id = s.cast_id
      where s.status = 'pending'
      order by s.submitted_at desc limit 1
    ),
    'last_reviewed', (
      select jsonb_build_object('status', s.status, 'reviewed_at', s.reviewed_at)
      from public.cast_profile_submissions s join me m on m.id = s.cast_id
      where s.status <> 'pending'
      order by s.reviewed_at desc nulls last limit 1
    )
  ) end;
$$;

-- マイページ：プロフィールを提出する（確認待ちがあれば置き換える）
create or replace function public.submit_therapist_profile(p_token text, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast record;
  v_fields jsonb;
  v_id uuid;
begin
  select c.id, c.store_id into v_cast
  from public.casts c
  where p_token is not null and length(p_token) between 8 and 200
    and c.access_token = p_token and c.is_active
  limit 1;
  if v_cast.id is null then
    raise exception 'invalid token';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'invalid fields';
  end if;

  -- 決まった項目だけ、文字は300文字まで
  select coalesce(jsonb_object_agg(e.key, case
           when jsonb_typeof(e.value) = 'string' then to_jsonb(left(btrim(e.value #>> '{}'), 300))
           else e.value end), '{}'::jsonb)
    into v_fields
  from jsonb_each(p_fields) e
  where e.key = any(public.therapist_profile_field_keys())
    and jsonb_typeof(e.value) in ('string', 'number')
    and btrim(e.value #>> '{}') <> '';

  if v_fields = '{}'::jsonb then
    raise exception 'empty';
  end if;

  update public.cast_profile_submissions s
     set fields = v_fields, submitted_at = now()
   where s.cast_id = v_cast.id and s.status = 'pending'
  returning s.id into v_id;

  if v_id is null then
    insert into public.cast_profile_submissions (store_id, cast_id, fields)
    values (v_cast.store_id, v_cast.id, v_fields)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.get_therapist_profile_form(text) from public;
revoke all on function public.submit_therapist_profile(text, jsonb) from public;
grant execute on function public.get_therapist_profile_form(text) to anon, authenticated;
grant execute on function public.submit_therapist_profile(text, jsonb) to anon, authenticated;
