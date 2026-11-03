-- Infer task ownership from the existing type, label prefix and channel. Store work
-- remains in the admin schedule; no task data, device preferences or defaults change.
create schema if not exists private;
create or replace function private.is_therapist_promotion_task(p_task_type text, p_label text, p_channel text)
returns boolean
language sql immutable strict set search_path = ''
as $$
  select case
    when p_task_type <> 'posting' then false
    when p_channel in ('hp_top_banner', 'estama_top_banner', 'hp_news', 'estama_news', 'line_official') then false
    -- Ownership markers always win, even for a shared X/O2 channel.
    when v.prefix ~ '(店舗|お店|公式アカウント)' then false
    when v.prefix ~* '(バナー|ニュース|LINE|ＬＩＮＥ)' then false
    when p_channel in ('x_post', 'o2_post', 'o2_story') then true
    -- Legacy labels: generic X and 02 are personal, but unknown work fails closed.
    when v.prefix ~ '^(本人|セラピスト|個人)?(の)?[[:space:]]*[XＸ](投稿|[[:space:]（(]|$)' then true
    when v.prefix ~ '^(本人|セラピスト|個人)?(の)?[[:space:]]*(0|０|O|Ｏ)2' then true
    else false
  end
  from (
    select regexp_replace(split_part(replace(p_label, '：', ':'), ':', 1),
      '^[[:space:]]+|[[:space:]]+$', '', 'g') as prefix
  ) v
$$;
-- STRICT callers normalize absent fields to empty strings, allowing legacy label
-- fallback without granting a standalone classifier endpoint to any API role.
revoke all on function private.is_therapist_promotion_task(text, text, text) from public, anon, authenticated, service_role;

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
    -- General plan descriptions may contain instructions for store staff.
    'description', null,
    'startsOn', p.starts_on,
    'endsOn', p.ends_on,
    'tasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'taskType', t.task_type,
        'channelKey', t.channel_key,
        'scheduledOn', t.scheduled_on,
        'groupLabel', t.group_label,
        'label', t.label,
        'isCompleted', coalesce(tc.is_completed, false),
        'completedAt', case when tc.is_completed then tc.completed_at else null end,
        'storeCompleted', false,
        'sortOrder', t.sort_order
      ) order by t.sort_order, t.created_at, t.id), '[]'::jsonb)
      from public.promotion_plan_tasks t
      left join public.therapist_promotion_task_completions tc
        on tc.task_id = t.id and tc.cast_id = v_cast_id and tc.store_id = p.store_id
      where t.plan_id = p.id and t.store_id = p.store_id
        and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
    ),
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', pc.channel_key,
        'label', pc.channel_label,
        'count', visible.task_count,
        'sizeSpec', pc.size_spec,
        'sortOrder', pc.sort_order
      ) order by pc.sort_order, pc.created_at, pc.id), '[]'::jsonb)
      from public.promotion_plan_channels pc
      join lateral (
        select count(*)::integer as task_count
        from public.promotion_plan_tasks t
        where t.plan_id = p.id and t.store_id = p.store_id
          and t.channel_key = pc.channel_key
          and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
      ) visible on visible.task_count > 0
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
    )
    and exists (
      select 1 from public.promotion_plan_tasks t
      where t.plan_id = p.id and t.store_id = p.store_id
        and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
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
      and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
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
    where tc.store_id = p_store_id and tc.is_completed = true
      and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
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
  where tc.id = p_report_id and tc.is_completed = true
    and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''));
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

-- Keep the existing trigger attachment and notification transport unchanged.
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
    where t.id = new.task_id and t.store_id = new.store_id
      and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
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
