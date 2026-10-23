create or replace function public.wake_o2_control(p_store_id uuid) returns bigint language sql security definer set search_path='' as $$select private.dispatch_o2_control(p_store_id)$$;
revoke all on function public.wake_o2_control(uuid) from public,anon,authenticated;
grant execute on function public.wake_o2_control(uuid) to service_role;
