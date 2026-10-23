create or replace function private.dispatch_o2_control_pending() returns integer language plpgsql security definer set search_path='' as $$
declare s record; calls integer:=0;
begin
 for s in select distinct j.store_id from public.o2_account_jobs j left join public.o2_control_secrets c on c.job_id=j.id
 where (j.status='queued' or (j.status='awaiting_email' and c.code is not null and c.expires_at>now()))
 and not exists(select 1 from public.o2_control_locks l where l.store_id=j.store_id and l.locked_until>now()) loop
 perform private.dispatch_o2_control(s.store_id); calls:=calls+1;
 end loop;
 return calls;
end $$;
revoke all on function private.dispatch_o2_control_pending() from public,anon,authenticated;
select cron.schedule('o2-control-pending-every-minute','* * * * *','select private.dispatch_o2_control_pending()');
