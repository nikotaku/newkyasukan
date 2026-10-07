-- 着信ポップ（cti_calls）を店舗ごとに分ける。
-- 以前は store_id が既定店舗のまま・RLSも全店に開いていたので、かかってきた番号（To）から店舗を決め、
-- その店舗のお客様だけと照合する。他店の着信は見えない（store_isolation）。
--   店舗の決め方：店舗情報（store_info.phone）か stores.settings.cti_number がかかってきた番号と同じ店舗。
--   どれとも合わなければ既定店舗。

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cti_calls' and policyname = 'store_isolation') then
    create policy "store_isolation" on public.cti_calls as restrictive for all to authenticated
      using (store_id in (select public.current_store_ids()))
      with check (store_id in (select public.current_store_ids()));
  end if;
end
$$;

create index if not exists idx_cti_calls_store_created on public.cti_calls (store_id, created_at desc);

create or replace function public.cti_log_incoming(p_call_sid text, p_from text, p_to text)
returns table(customer_id uuid, customer_name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_store uuid;
  v_cust record;
begin
  if length(norm_phone(p_to)) >= 10 then
    select si.store_id into v_store
    from store_info si
    where norm_phone(si.phone) = norm_phone(p_to)
    limit 1;
    if v_store is null then
      select s.id into v_store
      from stores s
      where norm_phone(s.settings->>'cti_number') = norm_phone(p_to)
      limit 1;
    end if;
  end if;
  v_store := coalesce(v_store, '00000000-0000-0000-0000-000000000001'::uuid);

  if length(norm_phone(p_from)) >= 10 then
    select c.id, c.name into v_cust
    from customers c
    where c.store_id = v_store
      and norm_phone(c.phone) = norm_phone(p_from)
    order by (c.last_visited is null), c.last_visited desc
    limit 1;
  end if;

  insert into cti_calls (store_id, call_sid, from_number, to_number, customer_id, customer_name)
  values (v_store, p_call_sid, p_from, p_to, v_cust.id, v_cust.name)
  on conflict (call_sid) do nothing;

  return query select v_cust.id, v_cust.name;
end
$$;

revoke all on function public.cti_log_incoming(text, text, text) from public, anon, authenticated;
grant execute on function public.cti_log_incoming(text, text, text) to service_role;
