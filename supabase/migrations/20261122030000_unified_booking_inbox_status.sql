-- Give Estama requests the same human-response workflow as public form bookings.
-- The Estama request lifecycle (new / registered / dismissed) remains separate.
alter table public.estama_reservation_requests
  add column if not exists response_status text not null default 'unhandled',
  add column if not exists response_status_updated_at timestamptz,
  add column if not exists response_status_updated_by uuid references auth.users(id) on delete set null;

update public.estama_reservation_requests
set response_status = case when status = 'new' then 'unhandled' else 'handled' end,
    response_status_updated_at = case when status = 'new' then null else coalesce(handled_at, last_seen_at) end,
    response_status_updated_by = case when status = 'new' then null else handled_by end;

alter table public.estama_reservation_requests
  drop constraint if exists estama_reservation_requests_response_status_check,
  drop constraint if exists estama_reservation_requests_response_audit_check;

alter table public.estama_reservation_requests
  add constraint estama_reservation_requests_response_status_check
    check (response_status in ('unhandled', 'in_progress', 'handled')),
  add constraint estama_reservation_requests_response_audit_check
    check (
      (response_status = 'unhandled'
        and response_status_updated_at is null
        and response_status_updated_by is null)
      or
      (response_status in ('in_progress', 'handled')
        and response_status_updated_at is not null)
    );

create index if not exists idx_estama_requests_response_inbox
  on public.estama_reservation_requests (store_id, response_status, first_seen_at desc);

create or replace function public.normalize_estama_response_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A registered or dismissed request is always operationally complete.
  if new.status in ('registered', 'dismissed') then
    new.response_status := 'handled';
  end if;

  if new.response_status = 'unhandled' then
    new.response_status_updated_at := null;
    new.response_status_updated_by := null;
  elsif new.response_status in ('in_progress', 'handled') then
    if tg_op = 'INSERT'
      or old.response_status is distinct from new.response_status then
      new.response_status_updated_at := now();
      new.response_status_updated_by := auth.uid();
    else
      new.response_status_updated_at :=
        coalesce(new.response_status_updated_at, old.response_status_updated_at, now());
      new.response_status_updated_by :=
        coalesce(new.response_status_updated_by, old.response_status_updated_by, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_estama_response_status()
  from public, anon, authenticated;

drop trigger if exists trg_normalize_estama_response_status
  on public.estama_reservation_requests;
create trigger trg_normalize_estama_response_status
before insert or update of status, response_status,
  response_status_updated_at, response_status_updated_by
on public.estama_reservation_requests
for each row execute function public.normalize_estama_response_status();

create or replace function public.update_estama_response_status(
  p_id uuid,
  p_store_id uuid,
  p_status text
)
returns table (
  id uuid,
  response_status text,
  response_status_updated_at timestamptz,
  response_status_updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception 'Store manager access is required' using errcode = '42501';
  end if;
  if p_status not in ('unhandled', 'in_progress', 'handled') then
    raise exception 'Invalid response status' using errcode = '22023';
  end if;

  return query
  update public.estama_reservation_requests as request
  set response_status = p_status
  where request.id = p_id and request.store_id = p_store_id
  returning request.id, request.response_status,
    request.response_status_updated_at, request.response_status_updated_by;

  if not found then
    raise exception 'Estama request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_estama_response_status(uuid, uuid, text)
  from public, anon;
grant execute on function public.update_estama_response_status(uuid, uuid, text)
  to authenticated;

-- Keep the existing lifecycle action and the new response workflow in sync.
create or replace function public.set_estama_reservation_request(
  p_id uuid,
  p_status text,
  p_reservation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid;
begin
  select store_id into v_store
  from public.estama_reservation_requests
  where id = p_id;

  if v_store is null
    or auth.uid() is null
    or v_store not in (select public.current_store_ids()) then
    raise exception using
      message = 'この店舗の仮予約を操作する権限がありません',
      errcode = '42501';
  end if;
  if p_status not in ('new', 'registered', 'dismissed') then
    raise exception using message = '状態が正しくありません', errcode = '22023';
  end if;

  update public.estama_reservation_requests
  set status = p_status,
      response_status = case when p_status = 'new' then 'unhandled' else 'handled' end,
      reservation_id = case
        when p_status = 'registered' then coalesce(p_reservation_id, reservation_id)
        else reservation_id
      end,
      handled_by = case when p_status = 'new' then null else auth.uid() end,
      handled_at = case when p_status = 'new' then null else now() end
  where id = p_id;
end;
$$;

revoke all on function public.set_estama_reservation_request(uuid, text, uuid)
  from public, anon;
grant execute on function public.set_estama_reservation_request(uuid, text, uuid)
  to authenticated;

comment on column public.estama_reservation_requests.response_status is
  'Human response workflow, independent from new/registered/dismissed lifecycle.';

notify pgrst, 'reload schema';
