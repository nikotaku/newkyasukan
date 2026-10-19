-- 管理画面を使うのはオーナー1人だけなので、ログイン中（authenticated）の casts の権限を列ごとにするのをやめ、表ごと付ける。
-- 列ごとだと列を足すたびに grant が要り、付け忘れるとキャスト管理の一覧や保存が丸ごと permission denied になっていた
-- （2026-10 に new_customer_max_minutes・x_sub_account で2回起きた）。表ごとなら後から足す列も自動で読み書きできる。
-- 他店のデータは今まで通り store_isolation（RLS）で見えない。公開サイト（anon）の列ごとの制限はそのまま。
grant select, insert, update on table public.casts to authenticated;
