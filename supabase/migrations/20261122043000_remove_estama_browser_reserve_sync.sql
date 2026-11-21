-- 仮予約は通知メール本文から直接取り込む。Browserbaseで管理画面を読む旧経路を廃止する。
do $$
begin
  if exists (select 1 from cron.job where jobname = 'estama-reserve-sync') then
    perform cron.unschedule('estama-reserve-sync');
  end if;
end
$$;

drop function if exists public.request_estama_reserve_sync(uuid);
drop function if exists private.dispatch_estama_reserve_sync();
drop function if exists private.clear_estama_reserve_sync_request(uuid);
drop function if exists public.save_estama_reservation_requests(text, jsonb);
drop table if exists private.estama_reserve_sync_requests;

create or replace function public.save_estama_reservation_email(p_store_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.estama_reservation_requests;
  v_check jsonb;
  v_registered uuid;
  v_new boolean;
begin
  if p_store_id is null
    or coalesce(p_item ->> 'externalKey', '') = ''
    or coalesce(p_item ->> 'hopeDate', '') = ''
    or coalesce(p_item ->> 'hopeTime', '') = '' then
    raise exception using message = '仮予約メールの必須項目がありません', errcode = '22023';
  end if;

  insert into public.estama_reservation_requests as t (
    store_id, external_key, received_at, hope_date, hope_time, nomination_label, is_free, cast_name,
    course_label, course_minutes, course_price, nomination_fee, total_price, coupon, request_note,
    visit_kind, member_label, customer_name, customer_phone, customer_email
  ) values (
    p_store_id, left(p_item ->> 'externalKey', 200), (p_item ->> 'receivedAt')::timestamptz,
    (p_item ->> 'hopeDate')::date, (p_item ->> 'hopeTime')::time,
    left(p_item ->> 'nominationLabel', 100), coalesce((p_item ->> 'isFree')::boolean, false), left(p_item ->> 'castName', 100),
    left(p_item ->> 'courseLabel', 200), (p_item ->> 'courseMinutes')::int, (p_item ->> 'coursePrice')::int,
    (p_item ->> 'nominationFee')::int, (p_item ->> 'totalPrice')::int, left(p_item ->> 'coupon', 300), left(p_item ->> 'requestNote', 1000),
    left(p_item ->> 'visitKind', 20), left(p_item ->> 'memberLabel', 20), left(p_item ->> 'customerName', 100),
    left(p_item ->> 'customerPhone', 20), left(p_item ->> 'customerEmail', 200)
  )
  on conflict (store_id, external_key) do update set last_seen_at = now()
  returning * into v_row;
  v_new := v_row.first_seen_at >= now() - interval '5 seconds';

  if v_row.status = 'new' then
    v_registered := private.find_registered_reservation(v_row);
    v_check := private.check_estama_request(v_row);
    update public.estama_reservation_requests set
      cast_id = (v_check ->> 'castId')::uuid,
      check_status = v_check ->> 'status',
      check_note = v_check ->> 'note',
      status = case when v_registered is not null then 'registered' else status end,
      reservation_id = coalesce(v_registered, reservation_id),
      handled_at = case when v_registered is not null then now() else handled_at end
    where id = v_row.id;
  end if;

  return jsonb_build_object('id', v_row.id, 'new', v_new);
end;
$$;

revoke all on function public.save_estama_reservation_email(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_estama_reservation_email(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
