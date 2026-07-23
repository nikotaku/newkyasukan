-- 店舗別の公開料金RPCにコース説明（description）を追加。
drop function if exists public.get_public_back_rates(uuid);

create or replace function public.get_public_back_rates(p_store_id uuid)
returns table(id uuid, course_type text, duration integer, customer_price integer, description text)
language sql stable security definer set search_path to 'public'
as $$
  select id, course_type, duration, customer_price, description
  from public.back_rates
  where is_visible = true and store_id = p_store_id
  order by display_order asc, duration asc;
$$;
