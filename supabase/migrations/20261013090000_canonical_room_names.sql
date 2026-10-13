-- 艶華のルームを2つの名前にそろえる
--   艶月 … 仙台市青葉区二日町11-15 In-Towner（旧：インルーム・インroom・二日町インroom）
--   華月 … 仙台市青葉区春日町11-12 ラジュール仙台（旧：ラスルーム・ラズルーム・ラスroom）
-- シフト・予約は昔の呼び名（ラスルームなど）で入っていて、ルーム管理の「華月」「艶月」と名前が合わず、
-- 予約詳細で「ルーム管理にありません」になり、お客様の案内ページ（/g/）・SMSに住所が出なかった。
-- 画面側も同じ決まり（src/lib/storeRooms.ts の canonicalRoomName）。

create or replace function public.canonical_room_name(p_name text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when v.key is null or v.key = '' then null
    when v.key like '%艶月%' or v.key ~ '^イン(ルーム|room)$' or v.key like '%二日町%' or v.key like '%in-towner%' or v.key like '%intowner%' then '艶月'
    when v.key like '%華月%' or v.key ~ '^(ラス|ラズ)(ルーム|room)$' or v.key like '%春日町%' or v.key like '%ラジュール%' then '華月'
    else v.trimmed
  end
  from (
    select t.trimmed, lower(regexp_replace(normalize(t.trimmed, NFKC), '\s+', '', 'g')) as key
    from (select nullif(btrim(regexp_replace(btrim(coalesce(p_name, '')), '^■+|■+$', '', 'g')), '') as trimmed) t
  ) v
$$;

grant execute on function public.canonical_room_name(text) to anon, authenticated, service_role;

-- 保存のたびにそろえる（古い画面・HPのシフト取り込み・エステ魂の取り込みが昔の呼び名で書いても）
create or replace function public.normalize_room_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.room is not null then
    new.room := public.canonical_room_name(new.room);
  end if;
  return new;
end
$$;

revoke all on function public.normalize_room_column() from public, anon, authenticated;

drop trigger if exists trg_shifts_normalize_room on public.shifts;
create trigger trg_shifts_normalize_room
  before insert or update of room on public.shifts
  for each row execute function public.normalize_room_column();

-- 予約は「出勤のルームを入れる」トリガー（trg_reservations_default_room）より先に動くよう名前を a 始まりにする
drop trigger if exists trg_a_reservations_normalize_room on public.reservations;
create trigger trg_a_reservations_normalize_room
  before insert or update of room on public.reservations
  for each row execute function public.normalize_room_column();

drop trigger if exists trg_casts_normalize_room on public.casts;
create trigger trg_casts_normalize_room
  before insert or update of room on public.casts
  for each row execute function public.normalize_room_column();

-- これまでのデータをそろえる。呼び名を直すだけなので、セラピストへの「予約変更」通知は出さない
alter table public.reservations disable trigger reservations_therapist_notification;

update public.reservations
set room = public.canonical_room_name(room)
where room is not null and room is distinct from public.canonical_room_name(room);

update public.reservations
set guide_confirmed_room = public.canonical_room_name(guide_confirmed_room)
where guide_confirmed_room is not null and guide_confirmed_room is distinct from public.canonical_room_name(guide_confirmed_room);

alter table public.reservations enable trigger reservations_therapist_notification;

update public.shifts
set room = public.canonical_room_name(room)
where room is not null and room is distinct from public.canonical_room_name(room);

update public.casts
set room = public.canonical_room_name(room)
where room is not null and room is distinct from public.canonical_room_name(room);

-- ルーム管理：昔の行（ラズルーム・インルーム）の中身で、華月・艶月の空いている項目だけを埋めてから、昔の行は使わないにする
do $$
declare
  v_old record;
  v_target uuid;
  v_col record;
  v_sets text := '';
begin
  for v_col in
    select c.column_name, c.data_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'rooms'
      and c.column_name not in ('id', 'name', 'store_id', 'created_at', 'updated_at', 'is_active', 'show_in_therapist_portal', 'display_name', 'description')
      and c.data_type in ('text', 'jsonb', 'ARRAY')
  loop
    v_sets := v_sets || format(
      case v_col.data_type
        when 'text' then '%1$I = coalesce(nullif(btrim(t.%1$I), ''''), o.%1$I), '
        when 'jsonb' then '%1$I = case when t.%1$I is null or t.%1$I in (''[]''::jsonb, ''{}''::jsonb, ''null''::jsonb) then o.%1$I else t.%1$I end, '
        else '%1$I = case when t.%1$I is null or cardinality(t.%1$I) = 0 then o.%1$I else t.%1$I end, '
      end,
      v_col.column_name);
  end loop;
  v_sets := left(v_sets, length(v_sets) - 2);

  for v_old in
    select r.id, r.store_id, public.canonical_room_name(coalesce(r.name, '')) as canonical
    from public.rooms r
    where r.name not in ('華月', '艶月')
      and public.canonical_room_name(r.name) in ('華月', '艶月')
  loop
    select t.id into v_target
    from public.rooms t
    where t.name = v_old.canonical and t.store_id is not distinct from v_old.store_id
    limit 1;

    if v_target is null then
      -- 華月・艶月の行が無い店舗なら、昔の行の名前を付け替える
      update public.rooms set name = v_old.canonical where id = v_old.id;
    else
      execute format('update public.rooms t set %s from public.rooms o where t.id = $1 and o.id = $2', v_sets)
        using v_target, v_old.id;
      update public.rooms
      set is_active = false, show_in_therapist_portal = false,
          description = btrim(coalesce(description, '') || ' （' || v_old.canonical || 'にまとめました）')
      where id = v_old.id;
    end if;
  end loop;
end
$$;

-- 華月・艶月の行に display_name（■二日町インroom■ など昔の表示名）が入っていても、案内ページは名前で出す
update public.rooms set display_name = null
where name in ('華月', '艶月') and display_name is not null and public.canonical_room_name(display_name) = name and display_name <> name;
