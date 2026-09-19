-- 艶華の料金マスターを整理する。
-- 全力PKG1 / 全力PKG2 と全力Wコースを廃止し、
-- マイクロビキニを公開オプション（5,000円・セラピストフルバック）として追加する。

-- 表記ゆれを含めて、廃止した全力PKGのオプションを削除する。
delete from public.option_rates
where store_id = (select id from public.stores where name = '艶華' limit 1)
  and option_name in ('全力PKG1', '全力PKG1W', '全力PKG2', '全力PKG2W');

-- 廃止した全力Wコースをすべて削除する。
delete from public.back_rates
where store_id = (select id from public.stores where name = '艶華' limit 1)
  and course_type = '全力W';

-- 極液の直後にマイクロビキニを表示するため、後続オプションの表示順を繰り下げる。
update public.option_rates
set display_order = display_order + 1
where store_id = (select id from public.stores where name = '艶華' limit 1)
  and display_order >= 5
  and option_name <> 'マイクロビキニ';

insert into public.option_rates (
  store_id,
  option_name,
  customer_price,
  therapist_back,
  shop_back,
  extension_minutes,
  is_visible,
  display_order
)
select
  id,
  'マイクロビキニ',
  5000,
  5000,
  0,
  0,
  true,
  5
from public.stores
where name = '艶華'
limit 1
on conflict (store_id, option_name) do update
set customer_price = excluded.customer_price,
    therapist_back = excluded.therapist_back,
    shop_back = excluded.shop_back,
    extension_minutes = excluded.extension_minutes,
    is_visible = excluded.is_visible,
    display_order = excluded.display_order,
    updated_at = now();
