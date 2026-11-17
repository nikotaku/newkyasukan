-- 予約の二重登録を防ぐ（保存ボタンの連打・スマホの二重タップで、同じ予約が0.01〜1秒差で2件入っていた）。
-- 同じ店舗・同じセラピスト・同じ日時・同じ電話番号の予約（キャンセル以外）が2分以内に入っていたら、2件目は入れない。
-- ほぼ同時の2件はロックで順番に通し、2件目が1件目を見られるようにする。

create or replace function private.reject_duplicate_reservation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := public.norm_phone(new.customer_phone);
begin
  if coalesce(new.status, '') = 'cancelled' or coalesce(v_phone, '') = '' or new.cast_id is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(concat_ws('|', 'reservation-insert', new.store_id, new.cast_id,
    new.reservation_date, new.start_time, v_phone)));
  if exists (
    select 1 from public.reservations as existing
    where existing.store_id is not distinct from new.store_id
      and existing.cast_id = new.cast_id
      and existing.reservation_date = new.reservation_date
      and existing.start_time = new.start_time
      and coalesce(existing.status, '') <> 'cancelled'
      and public.norm_phone(existing.customer_phone) = v_phone
      and existing.created_at > now() - interval '2 minutes'
  ) then
    raise exception '同じ予約がすでに登録されています（二重登録を止めました）' using errcode = '23505';
  end if;
  return new;
end;
$function$;

create or replace trigger trg_reservations_reject_duplicate
  before insert on public.reservations
  for each row execute function private.reject_duplicate_reservation();
