-- 不足分を「振込済みにする」と、セラピストのマイページへ「💴 不足分 ¥X を振り込みました」を送る（本番に適用済み）
-- therapist_notifications は kind = 'settlement'、snapshot.event = 'shortage_paid'。取り消したらまだ送っていない知らせは送らない
CREATE OR REPLACE FUNCTION public.mark_settlement_shortage_paid(p_clearance_id uuid, p_paid boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_store uuid;
  v_row public.settlement_approvals;
begin
  select a.store_id into v_store from public.settlement_approvals a where a.clearance_id = p_clearance_id;
  if v_store is null or not public.can_manage_store(v_store) then
    raise exception 'この精算は操作できません' using errcode = '42501';
  end if;
  update public.settlement_approvals a
  set shortage_settled_at = case when p_paid then now() end,
      shortage_settled_note = case when p_paid then '振込済み' end,
      shortage_settled_in = null,
      shortage_settled_by = case when p_paid then auth.uid() end,
      updated_at = now()
  where a.clearance_id = p_clearance_id
    and a.shortage_amount > 0
  returning * into v_row;

  update public.therapist_notifications n
  set status = 'skipped', error_message = '振込済みを取り消したので送っていません', updated_at = now()
  where n.kind = 'settlement' and n.status = 'queued'
    and n.snapshot->>'clearance_id' = p_clearance_id::text
    and n.snapshot->>'event' = 'shortage_paid';
  if p_paid and v_row.clearance_id is not null then
    insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, source, available_at, snapshot)
    values (v_row.store_id, v_row.cast_id, null, 'settlement', 'auto', now(),
      jsonb_build_object('event', 'shortage_paid', 'clearance_id', v_row.clearance_id, 'date', v_row.date, 'shortage', v_row.shortage_amount));
    perform private.dispatch_therapist_notifications();
  end if;
end;
$function$;
