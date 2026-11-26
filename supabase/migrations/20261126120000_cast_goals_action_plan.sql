-- ゴールに「目標に向けた具体的な施策」（action_plan、2000文字まで）を足す。
-- 教育の「ゴール」タブで入れ、本人のマイページの「わたしのゴール」にも「やること」として出す（get_therapist_goal が返す）。

alter table public.cast_goals
  add column if not exists action_plan text check (action_plan is null or char_length(action_plan) <= 2000);

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
    select g.goal_text, g.action_plan, g.monthly_sales_target, g.monthly_count_target, g.honshimei_rate_target, g.updated_at
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
