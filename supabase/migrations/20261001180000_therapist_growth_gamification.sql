-- セラピストの行動を「達成・ポイント・集客実績」で見える化する。
-- 既存の店舗向けタスク完了状態を壊さず、セラピスト本人の完了状態は別テーブルで管理する。
alter table public.promotion_plan_tasks
  add column if not exists reward_points integer not null default 10;

create table if not exists public.therapist_promotion_task_completions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  task_id uuid not null references public.promotion_plan_tasks(id) on delete cascade,
  is_completed boolean not null default true,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint therapist_promotion_task_completions_unique unique (cast_id, task_id)
);
create index if not exists therapist_promotion_task_completions_cast_idx
  on public.therapist_promotion_task_completions (cast_id, is_completed, completed_at desc);
alter table public.therapist_promotion_task_completions enable row level security;
alter table public.therapist_promotion_task_completions force row level security;
drop policy if exists therapist_promotion_task_completions_managers on public.therapist_promotion_task_completions;
create policy therapist_promotion_task_completions_managers
on public.therapist_promotion_task_completions
for all to authenticated
using ((select public.can_manage_store(store_id)))
with check ((select public.can_manage_store(store_id)));
revoke all on table public.therapist_promotion_task_completions from anon;
revoke all on table public.therapist_promotion_task_completions from authenticated;
grant select, insert, update, delete on table public.therapist_promotion_task_completions to authenticated;

-- 既存RPCの戻り値を、本人用の完了状態と報酬ポイントを含む形に更新する。
drop function if exists public.get_therapist_promotion_schedules(text);
create function public.get_therapist_promotion_schedules(p_token text)
returns table (
  plan_id uuid,
  therapist_label text,
  plan_title text,
  plan_description text,
  starts_on date,
  ends_on date,
  task_id uuid,
  task_type text,
  scheduled_on date,
  group_label text,
  task_label text,
  is_completed boolean,
  sort_order integer,
  reward_points integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cast_id uuid;
  v_cast_name text;
begin
  select c.id, c.name into v_cast_id, v_cast_name
  from public.casts c where c.access_token = p_token limit 1;
  if v_cast_id is null then raise exception 'invalid token'; end if;
  return query
  select p.id, p.therapist_label, p.title, p.description, p.starts_on, p.ends_on,
    t.id, t.task_type, t.scheduled_on, t.group_label, t.label,
    coalesce(tc.is_completed, t.is_completed), t.sort_order, t.reward_points
  from public.promotion_plans p
  left join public.promotion_plan_tasks t on t.plan_id = p.id
  left join public.therapist_promotion_task_completions tc
    on tc.task_id = t.id and tc.cast_id = v_cast_id
  where p.is_active = true
    and (v_cast_id = any(p.cast_ids) or (cardinality(p.cast_ids) = 0 and
      (p.therapist_label = v_cast_name or v_cast_name = any(regexp_split_to_array(p.therapist_label, '\s*[&＆]\s*')))))
  order by p.starts_on desc nulls last, p.created_at desc, t.sort_order, t.created_at;
end;
$$;
revoke all on function public.get_therapist_promotion_schedules(text) from public, anon, authenticated;
grant execute on function public.get_therapist_promotion_schedules(text) to anon, authenticated;

create or replace function public.complete_therapist_promotion_task(p_token text, p_task_id uuid, p_completed boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_cast_id uuid;
  v_cast_store_id uuid;
  v_task_store_id uuid;
  v_plan_cast_ids uuid[];
begin
  select c.id, c.store_id into v_cast_id, v_cast_store_id
  from public.casts c where c.access_token = p_token limit 1;
  if v_cast_id is null then raise exception 'invalid token'; end if;
  select t.store_id, p.cast_ids into v_task_store_id, v_plan_cast_ids
  from public.promotion_plan_tasks t join public.promotion_plans p on p.id = t.plan_id
  where t.id = p_task_id and p.is_active = true;
  if v_task_store_id is null or v_task_store_id <> v_cast_store_id
     or not (v_cast_id = any(v_plan_cast_ids) or cardinality(v_plan_cast_ids) = 0) then
    raise exception 'task is not available for this therapist';
  end if;
  insert into public.therapist_promotion_task_completions
    (store_id, cast_id, task_id, is_completed, completed_at, updated_at)
  values
    (v_cast_store_id, v_cast_id, p_task_id, p_completed,
      case when p_completed then now() else null end, now())
  on conflict (cast_id, task_id) do update set
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    updated_at = now();
  return p_completed;
end;
$$;
revoke all on function public.complete_therapist_promotion_task(text, uuid, boolean) from public, authenticated;
grant execute on function public.complete_therapist_promotion_task(text, uuid, boolean) to anon, authenticated;

create or replace function public.get_therapist_growth_stats(p_token text)
returns table (
  total_points bigint,
  completed_tasks bigint,
  total_tasks bigint,
  active_days_streak integer,
  bookings_30d bigint,
  revenue_30d bigint,
  reviews_90d bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cast_id uuid;
  v_cast_name text;
  v_store_id uuid;
  v_streak integer := 0;
  v_day integer;
begin
  select c.id, c.name, c.store_id into v_cast_id, v_cast_name, v_store_id
  from public.casts c where c.access_token = p_token limit 1;
  if v_cast_id is null then raise exception 'invalid token'; end if;
  for v_day in 0..30 loop
    if exists (
      select 1 from public.therapist_promotion_task_completions tc
      where tc.cast_id = v_cast_id and tc.is_completed = true
        and tc.completed_at::date = current_date - v_day
    ) then v_streak := v_streak + 1; else exit; end if;
  end loop;
  return query
  select
    coalesce((select sum(t.reward_points)::bigint from public.therapist_promotion_task_completions tc
      join public.promotion_plan_tasks t on t.id = tc.task_id
      where tc.cast_id = v_cast_id and tc.is_completed = true), 0),
    coalesce((select count(*)::bigint from public.therapist_promotion_task_completions tc
      where tc.cast_id = v_cast_id and tc.is_completed = true), 0),
    coalesce((select count(*)::bigint from public.promotion_plan_tasks t join public.promotion_plans p on p.id = t.plan_id
      where p.is_active = true and (v_cast_id = any(p.cast_ids) or cardinality(p.cast_ids) = 0)), 0),
    v_streak,
    coalesce((select count(*)::bigint from public.reservations r where r.cast_id = v_cast_id
      and r.reservation_date >= current_date - 30 and r.reservation_date <= current_date
      and coalesce(r.status, '') not ilike '%cancel%'), 0),
    coalesce((select sum(coalesce(r.price, 0))::bigint from public.reservations r where r.cast_id = v_cast_id
      and r.reservation_date >= current_date - 30 and r.reservation_date <= current_date
      and coalesce(r.status, '') not ilike '%cancel%'), 0),
    coalesce((select count(*)::bigint from public.customer_reviews cr where cr.store_id = v_store_id
      and cr.is_published = true and cr.created_at >= now() - interval '90 days'
      and replace(coalesce(cr.therapist_name, ''), ' ', '') = replace(v_cast_name, ' ', '')), 0);
end;
$$;
revoke all on function public.get_therapist_growth_stats(text) from public, anon, authenticated;
grant execute on function public.get_therapist_growth_stats(text) to anon, authenticated;
