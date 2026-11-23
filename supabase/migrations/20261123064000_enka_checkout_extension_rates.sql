-- 当日の追加施術を精算できるよう、艶華の料金マスターに延長を登録する。
alter table public.option_rates
  add column if not exists is_checkout_only boolean not null default false;

-- セラピスト画面はトークン認証済みの精算RPCから取得する。
-- 店舗スタッフは既存の店舗分離ポリシーの範囲で料金を管理できる。
drop policy if exists "option_rates hide checkout from anon" on public.option_rates;
create policy "option_rates hide checkout from anon"
  on public.option_rates as restrictive for select to anon
  using (not is_checkout_only);

insert into public.option_rates (
  store_id, option_name, customer_price, therapist_back, shop_back,
  extension_minutes, is_visible, display_order, is_checkout_only
)
select s.id, r.option_name, r.customer_price, r.therapist_back, r.shop_back,
       r.extension_minutes, true, r.display_order, true
from public.stores s
cross join (values
  ('延長20分', 5000, 3000, 2000, 20, 10),
  ('延長40分', 10000, 6000, 4000, 40, 11)
) as r(option_name, customer_price, therapist_back, shop_back, extension_minutes, display_order)
where s.slug = 'tsuyaka'
on conflict (store_id, option_name) do nothing;
