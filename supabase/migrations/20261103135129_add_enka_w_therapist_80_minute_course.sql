-- Add the 80-minute W therapist course at exactly twice the regular
-- 80-minute Enka course price and payout amounts.
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
    and duration = 80;

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
    80,
    base_customer_price * 2,
    base_therapist_back * 2,
    base_shop_back * 2,
    101,
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
end
$$;
