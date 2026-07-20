-- 公開料金RPCの店舗対応。店舗IDを受け取るオーバーロードを追加
-- （引数なし版は既存のまま＝デフォルト店舗相当の全件を返す）。

create or replace function public.get_public_back_rates(p_store_id uuid)
returns table(id uuid, course_type text, duration integer, customer_price integer)
language sql stable security definer set search_path to 'public'
as $$
  select id, course_type, duration, customer_price
  from public.back_rates
  where is_visible = true and store_id = p_store_id
  order by display_order asc, duration asc;
$$;
