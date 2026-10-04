-- エステ魂のプロフィール「外部ブログ」欄に O2 のプロフィールURL（casts.o2_url）を載せるようにしたので、
-- O2のURLが変わったときもエスたまへの同期を積む（X欄は今まで通り casts.x_account の変更で積む）。

create or replace function public.trg_enqueue_estama_cast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_profile jsonb;
  v_new_profile jsonb;
  v_changed_fields text[];
begin
  if tg_op = 'INSERT' then
    if coalesce(new.estama_auto_register, false) then
      perform public.enqueue_estama_job(
        new.store_id,
        'estama_register_cast',
        new.id,
        null,
        'estama:cast:' || new.id::text,
        jsonb_build_object('source', 'cast_insert', 'full_sync', true)
      );
    end if;
    return new;
  end if;

  if coalesce(new.estama_auto_register, false)
     and not coalesce(old.estama_auto_register, false)
     and not exists (
       select 1
       from public.external_cast_profiles profile
       where profile.cast_id = new.id
         and profile.provider = 'estama'
         and profile.sync_status = 'synced'
     ) then
    perform public.enqueue_estama_job(
      new.store_id,
      'estama_register_cast',
      new.id,
      null,
      'estama:cast:' || new.id::text,
      jsonb_build_object('source', 'auto_register_enabled', 'full_sync', true)
    );
  end if;

  v_old_profile := jsonb_build_object(
    'name', old.name,
    'photo', old.photo,
    'photos', old.photos,
    'shop_comment', old.shop_comment,
    'therapist_comment', old.therapist_comment,
    'profile', old.profile,
    'message', old.message,
    'therapist_years', old.therapist_years,
    'therapist_experience', old.therapist_experience,
    'age', old.age,
    'height', old.height,
    'bust_size', old.bust_size,
    'bust', old.bust,
    'cup_size', old.cup_size,
    'body_size', old.body_size,
    'waist', old.waist,
    'hip', old.hip,
    'blood_type', old.blood_type,
    'favorite_techniques', old.favorite_techniques,
    'favorite_food', old.favorite_food,
    'ideal_type', old.ideal_type,
    'celebrity_lookalike', old.celebrity_lookalike,
    'celebrity_like', old.celebrity_like,
    'day_off_activities', old.day_off_activities,
    'hobby', old.hobby,
    'hobbies', old.hobbies,
    'blog_url', old.blog_url,
    'x_account', old.x_account,
    'o2_url', old.o2_url,
    'instagram_url', old.instagram_url,
    'features', old.features
  );
  v_new_profile := jsonb_build_object(
    'name', new.name,
    'photo', new.photo,
    'photos', new.photos,
    'shop_comment', new.shop_comment,
    'therapist_comment', new.therapist_comment,
    'profile', new.profile,
    'message', new.message,
    'therapist_years', new.therapist_years,
    'therapist_experience', new.therapist_experience,
    'age', new.age,
    'height', new.height,
    'bust_size', new.bust_size,
    'bust', new.bust,
    'cup_size', new.cup_size,
    'body_size', new.body_size,
    'waist', new.waist,
    'hip', new.hip,
    'blood_type', new.blood_type,
    'favorite_techniques', new.favorite_techniques,
    'favorite_food', new.favorite_food,
    'ideal_type', new.ideal_type,
    'celebrity_lookalike', new.celebrity_lookalike,
    'celebrity_like', new.celebrity_like,
    'day_off_activities', new.day_off_activities,
    'hobby', new.hobby,
    'hobbies', new.hobbies,
    'blog_url', new.blog_url,
    'x_account', new.x_account,
    'o2_url', new.o2_url,
    'instagram_url', new.instagram_url,
    'features', new.features
  );

  select array_agg(entry.key order by entry.key)
    into v_changed_fields
  from jsonb_each(v_new_profile) entry
  where entry.value is distinct from (v_old_profile -> entry.key);

  if coalesce(cardinality(v_changed_fields), 0) = 0 then
    return new;
  end if;

  if exists (
    select 1
    from public.external_cast_profiles profile
    where profile.cast_id = new.id
      and profile.provider = 'estama'
      and profile.sync_status = 'synced'
  ) then
    perform public.enqueue_estama_job(
      new.store_id,
      'estama_register_cast',
      new.id,
      null,
      'estama:cast:' || new.id::text,
      jsonb_build_object(
        'source', 'profile_update',
        'changed_fields', to_jsonb(v_changed_fields)
      )
    );
  end if;

  return new;
end;
$$;

-- drop trigger は casts 全体を強くロックして公開サイトの読み込みまで止めるので、create or replace にする
set lock_timeout = '5s';
create or replace trigger trg_enqueue_estama_cast_update
after update of
  name, photo, photos, shop_comment, therapist_comment, profile, message,
  therapist_years, therapist_experience, age, height, bust_size, bust,
  cup_size, body_size, waist, hip, blood_type, favorite_techniques,
  favorite_food, ideal_type, celebrity_lookalike, celebrity_like,
  day_off_activities, hobby, hobbies, blog_url, x_account, o2_url, instagram_url,
  features, estama_auto_register
on public.casts
for each row execute function public.trg_enqueue_estama_cast();
