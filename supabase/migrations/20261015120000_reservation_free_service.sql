-- 予約ごとの「無料サービス（分）」：事前予約の20分サービスなど、料金はそのままで施術を延ばすサービス。
--   予約表の予約フォームで なし / 10分 / 20分 / 30分 を選ぶ（reservations.free_service_minutes）
--   お客様：予約案内ページ（/g/:token）に「🎁 20分無料サービス付き」・予約確認SMSの {free_service}
--   セラピスト：予約通知のコース名に「（＋20分無料サービス）」が付き、終わりの時間も延びる
--   予約表の枠・HPの空き枠（get_reservation_slots）も、その分だけ長く押さえる

alter table public.reservations add column if not exists free_service_minutes smallint
  check (free_service_minutes is null or free_service_minutes between 5 and 60);
comment on column public.reservations.free_service_minutes is '無料サービスの時間（分）。料金は変えず施術を延ばす（事前予約の20分サービスなど）';

-- HPの空き枠：無料サービスの分も埋まっている時間に入れる
create or replace function public.get_reservation_slots(p_date date, p_cast_id uuid default null)
returns table(id uuid, cast_id uuid, reservation_date date, start_time time without time zone, duration integer)
language sql stable security definer set search_path = 'public' as $function$
  select id, cast_id, reservation_date, start_time, duration + coalesce(free_service_minutes, 0)
  from public.reservations
  where reservation_date = p_date
    and (p_cast_id is null or cast_id = p_cast_id)
    and status not in ('cancelled', 'hold');
$function$;

-- 予約案内ページ：free_service_minutes を返す
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.get_reservation_guide(text)'::regprocedure);
  if position('free_service_minutes' in v_def) = 0 then
    v_def := replace(v_def, $r$'duration', r.duration,$r$, $r$'duration', r.duration,
    'free_service_minutes', r.free_service_minutes,$r$);
    if position('free_service_minutes' in v_def) = 0 then raise exception 'get_reservation_guide patch failed'; end if;
    execute v_def;
  end if;
end $$;

-- セラピストへの予約通知：コース名に「（＋20分無料サービス）」、終わりの時間に無料サービスの分を足す
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.get_reservation_line_context(uuid)'::regprocedure);
  if position('free_service_minutes' in v_def) = 0 then
    v_def := replace(v_def, $r$      reservation.course_name,
      reservation.room,$r$, $r$      reservation.course_name,
      reservation.free_service_minutes,
      reservation.room,$r$);
    v_def := replace(v_def, $r$       and option_rate.option_name = requested_option.option_name
    ), 0),$r$, $r$       and option_rate.option_name = requested_option.option_name
    ), 0) + coalesce(target.free_service_minutes, 0),$r$);
    v_def := replace(v_def, $r$'course_name', target.course_name,$r$, $r$'course_name', case
      when coalesce(target.free_service_minutes, 0) > 0
        then coalesce(target.course_name, '') || '（＋' || target.free_service_minutes || '分無料サービス）'
      else target.course_name
    end,
    'free_service_minutes', target.free_service_minutes,$r$);
    if (length(v_def) - length(replace(v_def, 'free_service_minutes', ''))) / length('free_service_minutes') < 5 then
      raise exception 'get_reservation_line_context patch failed';
    end if;
    execute v_def;
  end if;
end $$;

-- 無料サービス（分）だけ変えたときも、セラピストへ予約の変更として知らせる
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.trg_enqueue_therapist_notification()'::regprocedure);
  if position('free_service_minutes' in v_def) = 0 then
    v_def := replace(v_def, $r$  if v_changes <> '{}'::jsonb then$r$, $r$  -- 無料サービス（分）だけ変わったときも、コース名の変更として知らせる（通知のコース名に「（＋20分無料サービス）」が付く）
  if new.free_service_minutes is distinct from old.free_service_minutes and not (v_changes ? 'course_name') then
    v_changes := v_changes || jsonb_build_object('course_name', case
      when coalesce(old.free_service_minutes, 0) > 0 then coalesce(old.course_name, '') || '（＋' || old.free_service_minutes || '分無料サービス）'
      else old.course_name end);
  end if;
  if v_changes <> '{}'::jsonb then$r$);
    if position('free_service_minutes' in v_def) = 0 then raise exception 'patch failed'; end if;
    execute v_def;
  end if;
end $$;

-- 艶華の予約確認SMSに {free_service} の行を足す（無料サービスの無い予約では行ごと消える）
update public.sms_auto_templates
set message = replace(message, E'{date} {time}〜 {course}\n', E'{date} {time}〜 {course}\n{free_service}\n')
where trigger = 'reservation_confirmed' and is_active and position('{free_service}' in message) = 0;
