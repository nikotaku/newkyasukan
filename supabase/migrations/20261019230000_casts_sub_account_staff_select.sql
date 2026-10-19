-- 20261018093000 で casts_admin_safe に x_sub_account / x_sub_account_visible を足したが、
-- この2列は authenticated に select の権限が無かった。ビューは security_invoker なので
-- スタッフ画面（キャスト管理）の select * が permission denied になり、一覧が空になっていた。
-- スタッフには読めてよい列なので authenticated にだけ付ける（公開サイト anon には付けない。HPは x_sub_account_public を使う）。
grant select (x_sub_account, x_sub_account_visible) on table public.casts to authenticated;
