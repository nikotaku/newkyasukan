-- 入力時だけ20文字を検証。既存プロフィールや提出レコードは変更しない。
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

  -- 既存の長いプロフィールは維持し、新規提出の文字列のみ検証する。
  -- PostgreSQL char_length は Unicode コードポイント単位（画面の Array.from と同じ）。
  if exists (
    select 1 from jsonb_each(p_fields) e
    where e.key = any(public.therapist_profile_field_keys())
      and jsonb_typeof(e.value) = 'string'
      and char_length(btrim(e.value #>> '{}')) > 20
  ) then
    raise exception 'profile text must be within 20 characters';
  end if;

  -- 決まった項目だけ、文字は20文字まで
  select coalesce(jsonb_object_agg(e.key, case
           when jsonb_typeof(e.value) = 'string' then to_jsonb(btrim(e.value #>> '{}'))
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

