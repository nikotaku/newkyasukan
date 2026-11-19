create table public.realtime_notices (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 body text not null check (char_length(btrim(body)) between 1 and 120),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 ended_at timestamptz,
 estama_status text not null default 'unconnected',
 check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
create index realtime_notices_history on public.realtime_notices(store_id,created_at desc);
alter table public.realtime_notices enable row level security;
revoke all on public.realtime_notices from public,anon,authenticated;
grant select on public.realtime_notices to authenticated;
create policy manager_history on public.realtime_notices for select to authenticated
using (public.can_manage_store(store_id));

create function public.publish_realtime_notice(p_store uuid,p_body text,p_minutes int,p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.can_manage_store(p_store),false) or auth.uid() is null then raise insufficient_privilege; end if;
 if p_minutes not between 1 and 1440 then raise exception 'invalid duration'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store::text,0));
 if exists(select 1 from public.realtime_notices where id=p_id and store_id=p_store) then return; end if;
 update public.realtime_notices set ended_at=now() where store_id=p_store and ended_at is null and expires_at>now();
 insert into public.realtime_notices(id,store_id,body,expires_at) values(p_id,p_store,btrim(p_body),now()+make_interval(mins=>p_minutes));
end $$;
create function public.stop_realtime_notice(p_store uuid,p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.can_manage_store(p_store),false) or auth.uid() is null then raise insufficient_privilege; end if;
 update public.realtime_notices set ended_at=now() where store_id=p_store and id=p_id and ended_at is null;
end $$;
create function public.current_realtime_notice(p_store uuid)
returns table(body text,remaining_ms bigint) language sql stable security definer set search_path = '' as $$
 select n.body,floor(extract(epoch from (n.expires_at-now()))*1000)::bigint
 from public.realtime_notices n where n.store_id=p_store and n.ended_at is null and n.expires_at>now()
 order by n.created_at desc limit 1
$$;
revoke all on function public.publish_realtime_notice(uuid,text,int,uuid),public.stop_realtime_notice(uuid,uuid) from public,anon;
grant execute on function public.publish_realtime_notice(uuid,text,int,uuid),public.stop_realtime_notice(uuid,uuid) to authenticated;
grant execute on function public.current_realtime_notice(uuid) to anon,authenticated;
