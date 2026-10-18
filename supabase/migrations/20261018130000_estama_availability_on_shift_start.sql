-- エステ魂の「ご案内状況（今すぐ）」は毎時40分の更新だけだったため、出勤が始まってから最大1時間近く
-- 「今すぐ」が出なかった（2026-10-18：12:00出勤 → 12:40まで表示なし）。
-- 出勤の開始（休憩明けも）から20分以内で、その後まだご案内状況の更新をしていなければ、5分ごとの確認で同じ更新をかける。
-- 毎時27〜42分は動かさない（40分の毎時更新・空き枠更新と重ねない）。

create or replace function private.dispatch_estama_availability_on_shift_start()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minute int := extract(minute from timezone('Asia/Tokyo', now()))::int;
begin
  if v_minute between 27 and 42 then
    return null;
  end if;

  if not exists (
    with starts as (
      select
        connection.store_id,
        ((shift_row.shift_date + shift_row.start_time) at time zone 'Asia/Tokyo') as started_at
      from public.automation_connections as connection
      join public.shifts as shift_row on shift_row.store_id = connection.store_id
      join public.casts as cast_row
        on cast_row.id = shift_row.cast_id and cast_row.is_active and cast_row.is_visible
      where connection.provider = 'estama'
        and connection.status = 'ready'
        and connection.browserbase_context_id is not null
        and shift_row.shift_date between (timezone('Asia/Tokyo', now()) - interval '1 day')::date
                                     and timezone('Asia/Tokyo', now())::date
        and shift_row.end_time <> shift_row.start_time
        and coalesce(shift_row.status, '') not in ('cancelled', 'rejected')
      union all
      -- 休憩明け（休憩の終わりが開始より前なら日付をまたいだ深夜）
      select
        connection.store_id,
        ((shift_row.shift_date + shift_row.break_end
          + case when shift_row.break_end < shift_row.start_time then interval '1 day' else interval '0 days' end)
          at time zone 'Asia/Tokyo') as started_at
      from public.automation_connections as connection
      join public.shifts as shift_row on shift_row.store_id = connection.store_id
      join public.casts as cast_row
        on cast_row.id = shift_row.cast_id and cast_row.is_active and cast_row.is_visible
      where connection.provider = 'estama'
        and connection.status = 'ready'
        and connection.browserbase_context_id is not null
        and shift_row.break_start is not null
        and shift_row.break_end is not null
        and shift_row.shift_date between (timezone('Asia/Tokyo', now()) - interval '1 day')::date
                                     and timezone('Asia/Tokyo', now())::date
        and coalesce(shift_row.status, '') not in ('cancelled', 'rejected')
    )
    select 1
    from starts
    where starts.started_at <= now()
      and starts.started_at > now() - interval '20 minutes'
      and not exists (
        select 1
        from public.estama_sync_reports as report
        where report.store_id = starts.store_id
          and report.created_at >= starts.started_at
          and (
            report.results @> jsonb_build_object('kind', 'availability_refresh')
            or report.summary like '%ご案内状況%'
          )
      )
  ) then
    return null;
  end if;

  return private.dispatch_estama_availability_refresh();
end;
$$;

revoke all on function private.dispatch_estama_availability_on_shift_start() from public, anon, authenticated;

select cron.schedule(
  'estama-availability-on-shift-start',
  '*/5 * * * *',
  'select private.dispatch_estama_availability_on_shift_start();'
);
