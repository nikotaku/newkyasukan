-- セラピストのマイページの精算で、1つの予約の支払いを分けて申請する
-- （例：はじめの会計はカード、あとから足したオプションは現金）。
-- コース・オプション・指名・割引の確かめと、送信済みの未承認報告の取り消しは
-- 既存の therapist_update_reservation に任せ、そのあとで分割の内訳を入れる。
create or replace function public.therapist_update_reservation_split(
  p_token text,
  p_reservation_id uuid,
  p_course_type text,
  p_duration integer,
  p_course_name text,
  p_options text[],
  p_discount integer,
  p_price integer,
  p_nomination_type text,
  p_payment_details jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cast_id uuid;
  v_store_id uuid;
  v_detail jsonb;
  v_method text;
  v_amount integer;
  v_pct numeric;
  v_fee integer;
  v_details jsonb := '[]'::jsonb;
  v_sum integer := 0;
  v_fee_sum integer := 0;
  v_first_method text;
  v_first_fee integer;
begin
  select c.id, c.store_id into v_cast_id, v_store_id
  from public.casts c
  where c.access_token = p_token
  limit 1;
  if v_cast_id is null then
    raise exception 'invalid token';
  end if;

  -- 1件だけなら分割をやめて、その支払い方法1つにする
  if jsonb_typeof(p_payment_details) <> 'array' or jsonb_array_length(p_payment_details) < 1 then
    raise exception 'payment details required';
  end if;
  if jsonb_array_length(p_payment_details) > 4 then
    raise exception 'too many split entries';
  end if;

  -- 内訳を確かめて、手数料は店舗の設定から計算し直す（画面の値は信用しない）
  for v_detail in select * from jsonb_array_elements(p_payment_details) loop
    v_method := v_detail->>'method';
    if v_method is null or v_method not in ('cash', 'card', 'paypay') then
      raise exception 'invalid payment method';
    end if;
    begin
      v_amount := (v_detail->>'amount')::integer;
    exception when others then
      raise exception 'invalid amount';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'invalid amount';
    end if;

    v_pct := 0;
    if v_method = 'card' then
      select coalesce(p.fee_percentage, 0) into v_pct
      from public.payment_settings p
      where p.store_id = v_store_id and p.payment_method ~* '(card|クレジット|カード)'
      limit 1;
    elsif v_method = 'paypay' then
      select coalesce(p.fee_percentage, 0) into v_pct
      from public.payment_settings p
      where p.store_id = v_store_id and p.payment_method ~* 'paypay'
      limit 1;
    end if;
    v_fee := round(v_amount * coalesce(v_pct, 0) / 100.0)::integer;

    if v_first_method is null then
      v_first_method := v_method;
    end if;
    v_sum := v_sum + v_amount;
    v_fee_sum := v_fee_sum + v_fee;
    v_details := v_details || jsonb_build_object('method', v_method, 'amount', v_amount, 'fee', v_fee);
  end loop;

  if v_sum <> p_price then
    raise exception 'split amounts must add up to the price';
  end if;

  -- 本人の予約か確かめてから、いったん分割を外す（既存の関数が金額の変更を受け付けるように）
  update public.reservations r
  set payment_details = null
  where r.id = p_reservation_id
    and r.cast_id = v_cast_id
    and r.store_id = v_store_id;
  if not found then
    raise exception 'reservation not found or not owned by cast';
  end if;

  -- 1つ目の支払い方法で全額を払ったものとして、コース・料金を既存の確かめに通す
  v_pct := 0;
  if v_first_method = 'card' then
    select coalesce(p.fee_percentage, 0) into v_pct
    from public.payment_settings p
    where p.store_id = v_store_id and p.payment_method ~* '(card|クレジット|カード)'
    limit 1;
  elsif v_first_method = 'paypay' then
    select coalesce(p.fee_percentage, 0) into v_pct
    from public.payment_settings p
    where p.store_id = v_store_id and p.payment_method ~* 'paypay'
    limit 1;
  end if;
  v_first_fee := round(p_price * coalesce(v_pct, 0) / 100.0)::integer;

  perform public.therapist_update_reservation(
    p_token,
    p_reservation_id,
    p_course_type,
    p_duration,
    p_course_name,
    p_options,
    p_discount,
    array[]::text[],
    p_price,
    v_first_fee,
    v_first_method,
    p_nomination_type
  );

  if jsonb_array_length(v_details) = 1 then
    return;
  end if;

  update public.reservations
  set payment_details = v_details,
      payment_fee = v_fee_sum,
      payment_method = v_first_method,
      updated_at = now()
  where id = p_reservation_id;
end;
$function$;

revoke all on function public.therapist_update_reservation_split(text, uuid, text, integer, text, text[], integer, integer, text, jsonb) from public;
grant execute on function public.therapist_update_reservation_split(text, uuid, text, integer, text, text[], integer, integer, text, jsonb) to anon, authenticated;
