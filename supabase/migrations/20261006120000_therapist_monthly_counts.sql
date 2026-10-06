-- セラピストのマイページ：その月の本数（施術済み＝completed / 予定＝confirmed。キャンセルは数えない）
-- 本人のトークン（casts.access_token）で確かめる。金額は返さない。
-- 月は営業日（朝6時切り替え）の日付で数える。p_month を省くと今月。

create or replace function public.get_therapist_monthly_counts(p_token text, p_month date default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select c.id
    from public.casts c
    where p_token is not null
      and length(p_token) between 8 and 200
      and c.access_token = p_token
    limit 1
  ),
  bounds as (
    select date_trunc(
      'month',
      coalesce(p_month, ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date)
    )::date as first_day
  ),
  picked as (
    select
      r.reservation_date,
      r.status,
      r.duration,
      coalesce(nullif(btrim(r.nomination_type), ''), 'フリー') as nomination
    from public.reservations r
    join me on me.id = r.cast_id
    cross join bounds b
    where r.reservation_date >= b.first_day
      and r.reservation_date < (b.first_day + interval '1 month')::date
      and r.status in ('completed', 'confirmed')
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'month', to_char((select first_day from bounds), 'YYYY-MM'),
    'done', (select count(*) from picked where status = 'completed'),
    'scheduled', (select count(*) from picked where status = 'confirmed'),
    'nominations', coalesce((
      select jsonb_agg(jsonb_build_object('label', n.nomination, 'done', n.done, 'scheduled', n.scheduled)
        order by n.done + n.scheduled desc, n.nomination)
      from (
        select nomination,
          count(*) filter (where status = 'completed') as done,
          count(*) filter (where status = 'confirmed') as scheduled
        from picked
        group by nomination
      ) n
    ), '[]'::jsonb),
    'durations', coalesce((
      select jsonb_agg(jsonb_build_object('minutes', d.duration, 'done', d.done, 'scheduled', d.scheduled)
        order by d.duration)
      from (
        select duration,
          count(*) filter (where status = 'completed') as done,
          count(*) filter (where status = 'confirmed') as scheduled
        from picked
        where duration is not null
        group by duration
      ) d
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.reservation_date, 'done', d.done, 'scheduled', d.scheduled)
        order by d.reservation_date)
      from (
        select reservation_date,
          count(*) filter (where status = 'completed') as done,
          count(*) filter (where status = 'confirmed') as scheduled
        from picked
        group by reservation_date
      ) d
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.get_therapist_monthly_counts(text, date) from public;
grant execute on function public.get_therapist_monthly_counts(text, date) to anon, authenticated;
