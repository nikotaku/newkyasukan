-- セラピストのマイページに、本人のゴール（教育の「ゴール」タブで決めたもの）とその月の実績を出す。
-- RPC get_therapist_goal(p_token, p_month)：本人のトークンで確かめ、本人の分だけ返す（anon可）。
-- 実績は管理画面（src/lib/castGoals.ts の monthActual）と同じ数え方：営業日（朝6時前は前日）でその月、
-- 施術済み（completed）の料金の合計・本数・本指名（本指名・姫予約）の割合。確定（confirmed）は予定。

create or replace function public.get_therapist_goal(p_token text, p_month date default null)
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
      and c.is_active
    limit 1
  ),
  bounds as (
    select date_trunc(
      'month',
      coalesce(p_month, ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date)
    )::date as first_day
  ),
  picked as (
    select r.status, coalesce(r.price, 0) as price, btrim(coalesce(r.nomination_type, '')) as nomination
    from public.reservations r
    join me on me.id = r.cast_id
    cross join bounds b
    where r.reservation_date >= b.first_day
      and r.reservation_date <= (b.first_day + interval '1 month')::date
      and r.status in ('completed', 'confirmed')
      and date_trunc('month', case when r.start_time < time '06:00' then r.reservation_date - 1 else r.reservation_date end)::date = b.first_day
  ),
  goal as (
    select g.goal_text, g.monthly_sales_target, g.monthly_count_target, g.honshimei_rate_target, g.updated_at
    from public.cast_goals g
    join me on me.id = g.cast_id
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'month', to_char((select first_day from bounds), 'YYYY-MM'),
    'goal', (select to_jsonb(goal) from goal),
    'sales', (select coalesce(sum(price), 0) from picked where status = 'completed'),
    'count', (select count(*) from picked where status = 'completed'),
    'honshimei', (select count(*) from picked where status = 'completed' and nomination in ('本指名', '姫予約')),
    'planned_count', (select count(*) from picked where status = 'confirmed'),
    'planned_sales', (select coalesce(sum(price), 0) from picked where status = 'confirmed')
  ) end;
$$;

revoke all on function public.get_therapist_goal(text, date) from public;
grant execute on function public.get_therapist_goal(text, date) to anon, authenticated;
