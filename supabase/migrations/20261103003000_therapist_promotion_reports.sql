-- Personal promotion progress and posting reports. Standalone on the live schema:
-- do not depend on reward_points/growth RPCs, or replace existing plural getters.
create table if not exists public.therapist_promotion_task_completions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  task_id uuid not null references public.promotion_plan_tasks(id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint therapist_promotion_task_completions_unique unique (cast_id, task_id)
);
alter table public.therapist_promotion_task_completions
  add column if not exists admin_seen_at timestamptz;
alter table public.therapist_promotion_task_completions
  alter column is_completed set default false;
create index if not exists therapist_promotion_task_completions_cast_idx
  on public.therapist_promotion_task_completions (cast_id, is_completed, completed_at desc);
create index if not exists therapist_promotion_task_completions_reports_idx
  on public.therapist_promotion_task_completions (store_id, completed_at desc)
  where is_completed = true;

-- Managers can read, but all writes go through the narrowly scoped RPCs below.
-- Replace the older FOR ALL policy if the historical completion table exists.
alter table public.therapist_promotion_task_completions enable row level security;
alter table public.therapist_promotion_task_completions force row level security;
drop policy if exists therapist_promotion_task_completions_managers
  on public.therapist_promotion_task_completions;
create policy therapist_promotion_task_completions_managers
  on public.therapist_promotion_task_completions for select to authenticated
  using ((select public.can_manage_store(store_id)));
revoke all on table public.therapist_promotion_task_completions from public, anon, authenticated, service_role;
grant select on table public.therapist_promotion_task_completions to authenticated, service_role;

-- New JSON API avoids changing the return type of any existing portal getter.
create or replace function public.get_therapist_promotion_schedule(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cast_id uuid;
  v_cast_name text;
  v_store_id uuid;
  v_result jsonb;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'invalid token' using errcode = '42501';
  end if;
  select c.id, c.name, c.store_id into v_cast_id, v_cast_name, v_store_id
  from public.casts c
  where c.access_token = p_token and c.is_active = true
  limit 1;
  if v_cast_id is null then
    raise exception 'invalid token' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'therapistLabel', p.therapist_label,
    'description', p.description,
    'startsOn', p.starts_on,
    'endsOn', p.ends_on,
    'tasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'taskType', t.task_type,
        'scheduledOn', t.scheduled_on,
        'groupLabel', t.group_label,
        'label', t.label,
        'isCompleted', coalesce(tc.is_completed, false),
        'completedAt', case when tc.is_completed then tc.completed_at else null end,
        'storeCompleted', t.is_completed,
        'sortOrder', t.sort_order
      ) order by t.sort_order, t.created_at, t.id), '[]'::jsonb)
      from public.promotion_plan_tasks t
      left join public.therapist_promotion_task_completions tc
        on tc.task_id = t.id and tc.cast_id = v_cast_id and tc.store_id = p.store_id
      where t.plan_id = p.id and t.store_id = p.store_id
    ),
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', pc.channel_key,
        'label', pc.channel_label,
        'count', pc.placement_count,
        'sizeSpec', pc.size_spec,
        'sortOrder', pc.sort_order
      ) order by pc.sort_order, pc.created_at, pc.id), '[]'::jsonb)
      from public.promotion_plan_channels pc
      where pc.plan_id = p.id and pc.store_id = p.store_id and pc.is_enabled = true
    )
  ) order by p.starts_on desc nulls last, p.created_at desc, p.id), '[]'::jsonb)
  into v_result
  from public.promotion_plans p
  where p.store_id = v_store_id and p.is_active = true
    and (
      v_cast_id = any(p.cast_ids)
      or (cardinality(p.cast_ids) = 0 and (
        p.therapist_label = v_cast_name
        or v_cast_name = any(regexp_split_to_array(p.therapist_label, '\s*[&＆]\s*'))
      ))
    );
  -- No date cutoff: assigned active plans remain available for personal history.
  return v_result;
end;
$$;
revoke all on function public.get_therapist_promotion_schedule(text) from public, anon, authenticated, service_role;
grant execute on function public.get_therapist_promotion_schedule(text) to anon, authenticated;

create or replace function public.complete_therapist_promotion_task(p_token text, p_task_id uuid, p_completed boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_cast_id uuid;
  v_cast_name text;
  v_store_id uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'invalid token' using errcode = '42501';
  end if;
  select c.id, c.name, c.store_id into v_cast_id, v_cast_name, v_store_id
  from public.casts c
  where c.access_token = p_token and c.is_active = true
  limit 1;
  if v_cast_id is null then
    raise exception 'invalid token' using errcode = '42501';
  end if;
  if p_completed is null then
    raise exception 'completed is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.promotion_plan_tasks t
    join public.promotion_plans p on p.id = t.plan_id and p.store_id = t.store_id
    where t.id = p_task_id and t.store_id = v_store_id and p.is_active = true
      and (
        v_cast_id = any(p.cast_ids)
        or (cardinality(p.cast_ids) = 0 and (
          p.therapist_label = v_cast_name
          or v_cast_name = any(regexp_split_to_array(p.therapist_label, '\s*[&＆]\s*'))
        ))
      )
  ) then
    raise exception 'task is not available for this therapist' using errcode = '42501';
  end if;

  -- Atomic UPSERT serializes concurrent submissions. Repeated values do not UPDATE,
  -- preserving timestamps/read status and avoiding duplicate trigger notifications.
  insert into public.therapist_promotion_task_completions as completion
    (store_id, cast_id, task_id, is_completed, completed_at, admin_seen_at, updated_at)
  values
    (v_store_id, v_cast_id, p_task_id, p_completed,
      case when p_completed then clock_timestamp() else null end, null, clock_timestamp())
  on conflict (cast_id, task_id) do update set
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    admin_seen_at = case when excluded.is_completed then null else completion.admin_seen_at end,
    updated_at = excluded.updated_at
  where completion.store_id = excluded.store_id
    and completion.is_completed is distinct from excluded.is_completed;
  if not found then
    -- A legitimate duplicate is success, but an inconsistent legacy row must not
    -- masquerade as a saved completion for a different store.
    if not exists (
      select 1 from public.therapist_promotion_task_completions tc
      where tc.cast_id = v_cast_id and tc.task_id = p_task_id
        and tc.store_id = v_store_id and tc.is_completed = p_completed
    ) then
      raise exception 'completion is not available for this therapist' using errcode = '42501';
    end if;
  end if;
  return p_completed;
end;
$$;
revoke all on function public.complete_therapist_promotion_task(text, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.complete_therapist_promotion_task(text, uuid, boolean) to anon, authenticated;

create or replace function public.get_therapist_promotion_reports(p_store_id uuid, p_unread_only boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.can_manage_store(p_store_id), false) then
    raise exception 'not authorized for this store' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(report.payload order by report.completed_at desc nulls last, report.id), '[]'::jsonb)
  into v_result
  from (
    select tc.id, tc.completed_at, jsonb_build_object(
      'id', tc.id, 'storeId', tc.store_id, 'castId', tc.cast_id, 'castName', c.name,
      'taskId', t.id, 'planId', p.id, 'planTitle', p.title,
      'taskLabel', t.label, 'taskType', t.task_type, 'scheduledOn', t.scheduled_on,
      'completedAt', tc.completed_at, 'adminSeenAt', tc.admin_seen_at
    ) as payload
    from public.therapist_promotion_task_completions tc
    join public.casts c on c.id = tc.cast_id and c.store_id = tc.store_id
    join public.promotion_plan_tasks t on t.id = tc.task_id and t.store_id = tc.store_id
    join public.promotion_plans p on p.id = t.plan_id and p.store_id = tc.store_id
    where tc.store_id = p_store_id and tc.is_completed = true and t.task_type = 'posting'
      and (not coalesce(p_unread_only, false) or tc.admin_seen_at is null)
    order by tc.completed_at desc nulls last, tc.id
    limit 200
  ) report;
  return v_result;
end;
$$;
revoke all on function public.get_therapist_promotion_reports(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.get_therapist_promotion_reports(uuid, boolean) to authenticated;

create or replace function public.mark_therapist_promotion_report_seen(p_report_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_store_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select tc.store_id into v_store_id
  from public.therapist_promotion_task_completions tc
  join public.casts c on c.id = tc.cast_id and c.store_id = tc.store_id
  join public.promotion_plan_tasks t on t.id = tc.task_id and t.store_id = tc.store_id
  join public.promotion_plans p on p.id = t.plan_id and p.store_id = tc.store_id
  where tc.id = p_report_id and tc.is_completed = true and t.task_type = 'posting';
  if v_store_id is null or not coalesce(public.can_manage_store(v_store_id), false) then
    raise exception 'report is not available' using errcode = '42501';
  end if;
  update public.therapist_promotion_task_completions
  set admin_seen_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_report_id and store_id = v_store_id and is_completed = true and admin_seen_at is null;
  return true;
end;
$$;
revoke all on function public.mark_therapist_promotion_report_seen(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_therapist_promotion_report_seen(uuid) to authenticated;

-- Append only the new category; never reset an existing device's topic choices.
update public.push_subscriptions
set topics = array_append(coalesce(topics, '{}'::text[]), 'promotion_task')
where not ('promotion_task' = any(coalesce(topics, '{}'::text[])));
-- Preserve the live column default (which may include categories absent in this repo).
do $$
declare
  v_default text;
  v_topics text[];
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_default
  from pg_catalog.pg_attrdef d
  join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.push_subscriptions'::regclass and a.attname = 'topics';
  if v_default is not null then
    execute 'select ' || v_default into v_topics;
  end if;
  v_topics := coalesce(v_topics, '{}'::text[]);
  if not ('promotion_task' = any(v_topics)) then
    v_topics := array_append(v_topics, 'promotion_task');
  end if;
  execute format('alter table public.push_subscriptions alter column topics set default %L::text[]', v_topics);
end;
$$;

-- Dedicated trigger: the live shared trg_push_notify has unrelated event branches.
create or replace function public.trg_push_notify_promotion_task()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  if new.is_completed is not true then return new; end if;
  if tg_op = 'UPDATE' then
    if old.is_completed is true then return new; end if;
  end if;
  if not exists (
    select 1 from public.promotion_plan_tasks t
    join public.promotion_plans p on p.id = t.plan_id and p.store_id = t.store_id
    join public.casts c on c.id = new.cast_id and c.store_id = t.store_id
    where t.id = new.task_id and t.store_id = new.store_id and t.task_type = 'posting'
  ) then return new; end if;
  if not exists (
    select 1 from public.push_subscriptions s
    where s.store_id = new.store_id and 'promotion_task' = any(s.topics)
  ) then return new; end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'push_notify_internal_secret' limit 1;
  if nullif(v_secret, '') is null then return new; end if;
  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The existing push-notify gateway requires a valid project JWT as well as the internal secret.
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-push-notify-secret', v_secret
    ),
    body := jsonb_build_object('event', 'promotion_task', 'id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Notification infrastructure must never roll back the therapist's saved report.
  raise warning 'promotion task push skipped: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_push_notify_promotion_task() from public, anon, authenticated, service_role;
drop trigger if exists therapist_promotion_task_completions_push_notify
  on public.therapist_promotion_task_completions;
create trigger therapist_promotion_task_completions_push_notify
  after insert or update of is_completed on public.therapist_promotion_task_completions
  for each row execute function public.trg_push_notify_promotion_task();
