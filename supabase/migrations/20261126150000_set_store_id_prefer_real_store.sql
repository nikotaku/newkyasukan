-- 艶華のオーナーは「艶華」と「過去データ」（既定店舗）の両方に紐付いているため、
-- set_store_id() が店舗を1つに決められず、画面から入れた経費・精算などが既定店舗（過去データ）に入っていた。
-- 2026-11-25 から管理画面は艶華の分だけを読むので、それらが見えなくなっていた。
-- 所属が複数でも、既定店舗以外が1つだけならその店舗にする。
create or replace function public.set_store_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store uuid;
  v_count int;
begin
  if auth.uid() is not null
     and (new.store_id is null or new.store_id = '00000000-0000-0000-0000-000000000001') then
    select count(*), min(store_id::text)::uuid into v_count, v_store
    from public.user_stores where user_id = auth.uid();
    if v_count > 1 then
      select count(*), min(store_id::text)::uuid into v_count, v_store
      from public.user_stores
      where user_id = auth.uid() and store_id <> '00000000-0000-0000-0000-000000000001';
    end if;
    if v_count = 1 then
      new.store_id := v_store;
    end if;
  end if;
  if new.store_id is null then
    new.store_id := '00000000-0000-0000-0000-000000000001';
  end if;
  return new;
end;
$function$;
