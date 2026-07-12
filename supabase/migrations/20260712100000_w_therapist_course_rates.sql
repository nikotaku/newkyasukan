-- Wセラピスト（2人同時施術）専用コース・オプション。
-- therapist_back は「2人合計」の報酬額（予約はペア名義キャスト1件に紐づくため）。
-- is_visible=false で公開HP・通常の予約フォームには出さず、専用フォームだけが直接参照する。

insert into back_rates (course_type, duration, customer_price, therapist_back, shop_back, display_order, is_visible, description, store_id)
select v.course_type, v.duration, v.customer_price, v.therapist_back, v.shop_back, v.display_order, false, 'Wセラピスト2人同時施術（バックは2人合計）', '00000000-0000-0000-0000-000000000001'
from (values
  ('全力W', 100, 40000, 24000, 16000, 100),
  ('全力W', 120, 46000, 28000, 18000, 101)
) as v(course_type, duration, customer_price, therapist_back, shop_back, display_order)
where not exists (
  select 1 from back_rates b where b.course_type = v.course_type and b.duration = v.duration
);

insert into option_rates (option_name, customer_price, therapist_back, shop_back, display_order, is_visible, extension_minutes, store_id)
select v.option_name, v.customer_price, v.therapist_back, 0, v.display_order, false, 0, '00000000-0000-0000-0000-000000000001'
from (values
  ('全力PKG1W', 20000, 20000, 100),
  ('全力PKG2W', 16000, 16000, 101)
) as v(option_name, customer_price, therapist_back, display_order)
where not exists (
  select 1 from option_rates o where o.option_name = v.option_name
);
