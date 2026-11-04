-- Keep the W therapist menu to 60/80/100 minutes and add the dedicated
-- 2,000-yen nomination option used by that menu.
do $$
declare
  enka_store_id uuid;
  base_customer_price integer;
  base_therapist_back integer;
  base_shop_back integer;
begin
  select id
  into strict enka_store_id
  from public.stores
  where name = '艶華'
    and slug = 'tsuyaka'
    and custom_domain = 'enka-salon.jp';

  select customer_price, therapist_back, shop_back
  into strict base_customer_price, base_therapist_back, base_shop_back
  from public.back_rates
  where store_id = enka_store_id
    and course_type = '艶華'
    and duration = 60;

  insert into public.back_rates (
    store_id,
    course_type,
    duration,
    customer_price,
    therapist_back,
    shop_back,
    display_order,
    is_visible,
    description
  ) values (
    enka_store_id,
    'Wセラピストコース',
    60,
    base_customer_price * 2,
    base_therapist_back * 2,
    base_shop_back * 2,
    100,
    false,
    'Wセラピスト2人同時施術（バックは2人合計）'
  )
  on conflict (store_id, course_type, duration) do update
  set customer_price = excluded.customer_price,
      therapist_back = excluded.therapist_back,
      shop_back = excluded.shop_back,
      display_order = excluded.display_order,
      is_visible = excluded.is_visible,
      description = excluded.description,
      updated_at = now();

  delete from public.back_rates
  where store_id = enka_store_id
    and course_type = 'Wセラピストコース'
    and duration = 120;

  insert into public.nomination_rates (
    store_id,
    nomination_type,
    customer_price,
    therapist_back,
    shop_back
  ) values (
    enka_store_id,
    '特別指名料',
    2000,
    2000,
    0
  )
  on conflict (store_id, nomination_type) do update
  set customer_price = excluded.customer_price,
      therapist_back = excluded.therapist_back,
      shop_back = excluded.shop_back,
      updated_at = now();
end
$$;
