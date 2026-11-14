-- The completion table deliberately has no client write grants. Managers use a
-- scoped RPC, sharing the same per-therapist rows as the existing portal RPC.
create or replace function public.admin_complete_therapist_promotion_task(
  p_store_id uuid, p_cast_id uuid, p_task_id uuid, p_completed boolean
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.can_manage_store(p_store_id), false) then
    raise exception 'not authorized for this store' using errcode = '42501';
  end if;
  if p_completed is null then
    raise exception 'completed is required' using errcode = '22023';
  end if;
  -- Lock the assignment while saving; never accept an unrelated therapist,
  -- another store's task, an inactive plan, or a store-owned task.
  perform 1
  from public.promotion_plan_tasks t
  join public.promotion_plans p on p.id = t.plan_id and p.store_id = t.store_id
  join public.casts c on c.id = p_cast_id and c.store_id = p.store_id
  where t.id = p_task_id and t.store_id = p_store_id and p.is_active = true
    and private.is_therapist_promotion_task(coalesce(t.task_type, ''), coalesce(t.label, ''), coalesce(t.channel_key, ''))
    and (
      c.id = any(p.cast_ids)
      or (cardinality(p.cast_ids) = 0 and (
        p.therapist_label = c.name
        or c.name = any(regexp_split_to_array(p.therapist_label, '\s*[&＆]\s*'))
      ))
    )
  for share of t, p, c;
  if not found then
    raise exception 'task is not available for this therapist' using errcode = '42501';
  end if;

  insert into public.therapist_promotion_task_completions as completion
    (store_id, cast_id, task_id, is_completed, completed_at, admin_seen_at, updated_at)
  values (p_store_id, p_cast_id, p_task_id, p_completed,
    case when p_completed then clock_timestamp() else null end,
    clock_timestamp(), clock_timestamp())
  on conflict (cast_id, task_id) do update set
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    admin_seen_at = excluded.admin_seen_at,
    updated_at = excluded.updated_at
  where completion.store_id = excluded.store_id
    and completion.is_completed is distinct from excluded.is_completed;
  if not found and not exists (
    select 1 from public.therapist_promotion_task_completions tc
    where tc.store_id = p_store_id and tc.cast_id = p_cast_id
      and tc.task_id = p_task_id and tc.is_completed = p_completed
  ) then
    raise exception 'completion could not be saved' using errcode = '42501';
  end if;
  return p_completed;
end;
$$;
revoke all on function public.admin_complete_therapist_promotion_task(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_complete_therapist_promotion_task(uuid, uuid, uuid, boolean)
  to authenticated;

-- Manager-entered completions are already reviewed, not new therapist reports.
-- Portal completions still set admin_seen_at to NULL and notify as before.
create or replace trigger therapist_promotion_task_completions_push_notify
  after insert or update of is_completed on public.therapist_promotion_task_completions
  for each row when (new.is_completed = true and new.admin_seen_at is null)
  execute function public.trg_push_notify_promotion_task();
