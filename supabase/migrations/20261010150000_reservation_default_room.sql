-- 予約のルームが空なら、そのセラピストのその日の出勤（shifts.room）を入れる
-- WEB予約・セラピスト専用フォームの予約はルームを選ばずに入るため、予約詳細・案内ページ（/g/）にルームが出なかった。
-- 出勤のルームが1つに決まるときだけ入れる（取り消し・却下の出勤は見ない）。管理画面でルームを選んだ予約はそのまま。
-- ※ 予約表を開いたときにも画面側（src/lib/reservationRoom.ts）で同じように埋めて保存している

create or replace function public.reservations_default_room()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rooms text[];
  v_business_date date;
begin
  if coalesce(btrim(new.room), '') <> '' or new.cast_id is null or new.reservation_date is null then
    return new;
  end if;
  -- 朝6時前の予約（深夜）は前の日の出勤
  v_business_date := case when new.start_time is not null and new.start_time < time '06:00'
    then new.reservation_date - 1 else new.reservation_date end;
  select array_agg(distinct btrim(s.room))
  into v_rooms
  from public.shifts s
  where s.cast_id = new.cast_id
    and s.shift_date = v_business_date
    and coalesce(btrim(s.room), '') <> ''
    and coalesce(s.status, '') not in ('cancelled', 'canceled', 'absent')
    and coalesce(s.approval_status, '') <> 'rejected';
  if array_length(v_rooms, 1) = 1 then
    new.room := v_rooms[1];
  end if;
  return new;
end
$$;

revoke all on function public.reservations_default_room() from public, anon, authenticated;

drop trigger if exists trg_reservations_default_room on public.reservations;
create trigger trg_reservations_default_room
  before insert or update of cast_id, reservation_date, room on public.reservations
  for each row execute function public.reservations_default_room();
