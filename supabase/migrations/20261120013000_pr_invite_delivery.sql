create table public.pr_invite_deliveries (
 store_id uuid not null references public.stores(id),
 recipient_key text not null,
 task_id uuid not null references public.pr_desk_history(id),
 coupon_id uuid not null references public.discounts(id),
 created_at timestamptz not null default now(),
 primary key(store_id,recipient_key)
);
alter table public.pr_invite_deliveries enable row level security;
revoke all on public.pr_invite_deliveries from public,anon,authenticated;
grant all on public.pr_invite_deliveries to service_role;
create function public.pr_reserve_invite(p_store uuid,p_run text,p_task uuid,p_recipient text,p_coupon uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_recipient !~ '^[0-9a-f]{64}$' or not exists (
  select 1 from public.pr_desk_history h join public.pr_desk_settings s using(store_id)
  join public.discounts d on d.id=s.coupon_id and d.store_id=s.store_id
  where h.id=p_task and h.kind='invites' and h.status='running' and h.run_id=p_run
  and h.store_id=p_store and h.expires_at>now() and s.invites and s.invite_text=h.body
  and d.id=p_coupon and d.is_active and d.public_booking_enabled
 ) then return false; end if;
 insert into public.pr_invite_deliveries(store_id,recipient_key,task_id,coupon_id)
 values(p_store,p_recipient,p_task,p_coupon) on conflict do nothing;
 return found;
end $$;
revoke all on function public.pr_reserve_invite(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pr_reserve_invite(uuid,text,uuid,text,uuid) to service_role;
