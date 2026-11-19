create table public.promotion_quota_archives (
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  month_start date not null check (extract(day from month_start) = 1),
  primary key (store_id, month_start, cast_id)
);
alter table public.promotion_quota_archives enable row level security;
grant select, insert, delete on public.promotion_quota_archives to authenticated;
create policy quota_archive_read on public.promotion_quota_archives for select to authenticated
  using (store_id in (select public.current_store_ids()));
create policy quota_archive_add on public.promotion_quota_archives for insert to authenticated
  with check (public.can_manage_store(store_id) and exists
    (select 1 from public.casts c where c.id = cast_id and c.store_id = promotion_quota_archives.store_id));
create policy quota_archive_restore on public.promotion_quota_archives for delete to authenticated
  using (public.can_manage_store(store_id));
