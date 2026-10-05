-- 予約案内ページ（/g/:token）に「お支払いのご案内」を出す。
-- カード・PayPayで予約したお客様に、決済金額（手数料込み）・決済ページのリンク・手順を見せる。
-- 手順は決済方法ごとに payment_settings.customer_guide（1行に1つ）で、管理画面の「決済方法」で編集する。

alter table public.payment_settings
  add column if not exists customer_guide text;

-- カード決済の手順のたたき台（決済ページの実際の表示に合わせて管理画面で直す）
update public.payment_settings
set customer_guide = concat_ws(E'\n',
  '下の「カード決済ページを開く」を押します',
  '決済ページの案内に沿って、お支払い金額（上の手数料込みの金額）とお客様情報を入力します',
  'カード番号・有効期限・セキュリティコードを入力して、決済します',
  'カード会社の本人認証の画面が出たら、案内に沿って進めてください',
  '決済完了の画面が出たら、お手続きは完了です'
)
where customer_guide is null
  and payment_method ~* '(クレジット|カード|card)';

-- 案内ページ用。キャンセル済みと、予約日の翌日を過ぎたものは返さない
create or replace function public.get_reservation_guide(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'customer_name', r.customer_name,
    'reservation_date', r.reservation_date,
    'start_time', r.start_time,
    'duration', r.duration,
    'course_name', r.course_name,
    'options', coalesce(to_jsonb(r.options), '[]'::jsonb),
    'cast_name', c.name,
    'price', r.price,
    'store', jsonb_build_object('name', s.name, 'phone', si.phone, 'line_url', si.line_url),
    'room', case when rm.id is null then null else jsonb_build_object(
      'name', coalesce(rm.display_name, rm.name),
      'address', rm.address,
      'map_url', rm.map_url,
      'landmark', rm.sms_landmark,
      'caution_text', rm.caution_text,
      'guide_steps', rm.customer_guide_steps
    ) end,
    -- カード・PayPayで払う分（分割払いならその分だけ）。amount は手数料込みのお支払い金額
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'method', pay.method,
        'amount', pay.amount,
        'fee', pay.fee,
        'link', setting.payment_link,
        'guide', setting.customer_guide
      ) order by pay.method)
      from (
        select detail.method,
          sum(detail.base + detail.fee)::integer as amount,
          sum(detail.fee)::integer as fee
        from (
          select lower(item->>'method') as method,
            coalesce((item->>'amount')::numeric, 0) as base,
            coalesce(
              (item->>'fee')::numeric,
              round(coalesce((item->>'amount')::numeric, 0) * coalesce((
                select max(ps.fee_percentage) from public.payment_settings ps
                where ps.store_id = r.store_id
                  and ps.payment_method ~* case lower(item->>'method') when 'card' then '(クレジット|カード|card)' else 'paypay' end
              ), 0) / 100.0)
            ) as fee
          from jsonb_array_elements(case when jsonb_typeof(r.payment_details) = 'array' then r.payment_details else '[]'::jsonb end) item
        ) detail
        where detail.method in ('card', 'paypay') and detail.base > 0
        group by detail.method

        union all

        select r.payment_method,
          (coalesce(r.price, 0) + coalesce(r.payment_fee, 0))::integer,
          coalesce(r.payment_fee, 0)::integer
        where r.payment_method in ('card', 'paypay')
          -- 分割払いの内訳が無い予約（payment_details が null・空）だけ
          and not coalesce(case when jsonb_typeof(r.payment_details) = 'array' then jsonb_array_length(r.payment_details) > 0 end, false)
      ) pay
      left join lateral (
        select ps.payment_link, ps.customer_guide
        from public.payment_settings ps
        where ps.store_id = r.store_id
          and ps.payment_method ~* case pay.method when 'card' then '(クレジット|カード|card)' else 'paypay' end
        limit 1
      ) setting on true
    ), '[]'::jsonb)
  )
  from public.reservations r
  left join public.casts c on c.id = r.cast_id
  left join public.stores s on s.id = r.store_id
  left join lateral (
    select phone, line_url from public.store_info where store_id = r.store_id limit 1
  ) si on true
  left join lateral (
    select * from public.rooms where store_id = r.store_id and name = r.room limit 1
  ) rm on true
  where p_token ~ '^[A-Za-z0-9_-]{12,32}$'
    and r.guide_token = p_token
    and r.status <> 'cancelled'
    and r.reservation_date >= (now() at time zone 'Asia/Tokyo')::date - 1;
$$;

revoke all on function public.get_reservation_guide(text) from public;
grant execute on function public.get_reservation_guide(text) to anon, authenticated;

-- 予約確認SMSに、カード・PayPayの方だけ「リンクを開くと決済方法の案内が出ます」を入れる（案内ページのリンクのすぐ下）
update public.sms_auto_templates
set message = replace(message, '{guide_url}', E'{guide_url}\n{payment_guide}')
where trigger = 'reservation_confirmed'
  and message like '%{guide_url}%'
  and message not like '%{payment_guide}%';
