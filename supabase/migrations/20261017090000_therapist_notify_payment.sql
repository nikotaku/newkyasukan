-- セラピストへの予約通知に 割引金額・決済方法・決済状況 を載せる（開始時刻は前から）。本番には関数定義を書き換えて適用済み
--   get_reservation_line_context：payment_method / payment_details / payment_status / discount を返す
--   trg_enqueue_therapist_notification：割引・決済方法・決済状況が変わったら「変更」として知らせる
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.get_reservation_line_context(uuid)'::regprocedure);
  if position('payment_status' in v_def) = 0 then
    v_def := replace(v_def, $r$      reservation.payment_fee,
      reservation.nomination_type,$r$, $r$      reservation.payment_fee,
      reservation.payment_method,
      reservation.payment_details,
      reservation.payment_status,
      reservation.discount,
      reservation.nomination_type,$r$);
    v_def := replace(v_def, $r$    'payment_fee', coalesce(target.payment_fee, 0),$r$, $r$    'payment_fee', coalesce(target.payment_fee, 0),
    'payment_method', target.payment_method,
    'payment_details', target.payment_details,
    'payment_status', target.payment_status,
    'discount', coalesce(target.discount, 0),$r$);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.trg_enqueue_therapist_notification()'::regprocedure);
  if position('payment_status' in v_def) = 0 then
    v_def := replace(v_def, $r$  if v_changes <> '{}'::jsonb then$r$, $r$  -- 割引・決済の変更も知らせる（割引金額・決済方法・決済状況）
  if new.discount is distinct from old.discount then
    v_changes := v_changes || jsonb_build_object('discount', coalesce(old.discount, 0));
  end if;
  if new.payment_method is distinct from old.payment_method or new.payment_details is distinct from old.payment_details then
    v_changes := v_changes || jsonb_build_object('payment_method', old.payment_method, 'payment_details', old.payment_details);
  end if;
  if new.payment_status is distinct from old.payment_status then
    v_changes := v_changes || jsonb_build_object('payment_status', old.payment_status);
  end if;
  if v_changes <> '{}'::jsonb then$r$);
    execute v_def;
  end if;
end $$;
