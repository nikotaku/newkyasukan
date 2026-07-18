-- 顧客詳細ページ用：顧客の全来店履歴を電話番号正規化マッチで取得。
-- reservations.customer_phone は表記ゆれがあるため norm_phone で照合する。

create or replace function public.get_customer_reservations(p_customer_id uuid)
returns table(
  id uuid, reservation_date text, start_time text, course_name text,
  options text[], nomination_type text, price integer, discount integer,
  status text, cast_name text, notes text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_phone text;
begin
  -- 管理画面専用（ログイン必須）
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  select c.phone into v_phone from customers c where c.id = p_customer_id;
  if v_phone is null or length(norm_phone(v_phone)) < 10 then
    return;
  end if;

  return query
  select
    r.id,
    r.reservation_date::text,
    left(r.start_time::text, 5),
    r.course_name,
    r.options,
    r.nomination_type,
    r.price,
    r.discount,
    r.status,
    c.name as cast_name,
    r.notes
  from reservations r
  left join casts c on c.id = r.cast_id
  where norm_phone(r.customer_phone) = norm_phone(v_phone)
  order by r.reservation_date desc, r.start_time desc
  limit 500;
end;
$$;
