-- 予約ごとの案内ページ（/r/:token）。
-- SMSにはこのページのリンクだけを載せ、予約内容・ルームの住所・入室方法・道順はページで見せる（SMSの通数を減らす）。
-- トークンは推測できない12文字（72bit）。案内ページは匿名で開けるので、返す項目は RPC で絞る。

create or replace function public.new_guide_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
$$;

alter table public.reservations
  add column if not exists guide_token text default public.new_guide_token();

update public.reservations set guide_token = public.new_guide_token() where guide_token is null;

create unique index if not exists reservations_guide_token_key on public.reservations (guide_token);

-- お客様向けの道順ガイド（写真と説明の順番付きリスト: [{ "image_url": "...", "text": "..." }]）
-- entry_flow / entry_photos / key_* はセラピスト向けの入室情報なので、お客様には出さない
alter table public.rooms
  add column if not exists customer_guide_steps jsonb not null default '[]'::jsonb;

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
    ) end
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
