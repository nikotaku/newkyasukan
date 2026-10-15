-- casts は列ごとに権限を付けているので、あとから足した列はログイン中のスタッフ（authenticated）に付け直す。
-- 付けていなかったため、スタッフ画面のセラピスト編集「更新する」が permission denied for table casts になっていた
--   new_customer_max_minutes（新規のお客様のコース上限）/ banner_images・banner_copy・banner_enabled（トップバナーの素材）
grant select (new_customer_max_minutes, banner_images, banner_copy, banner_enabled) on public.casts to authenticated;
grant update (new_customer_max_minutes, banner_images, banner_copy, banner_enabled) on public.casts to authenticated;
