insert into public.site_content(store_id,key,value)
select store_id,'store_sns_x',coalesce(twitter_url,'') from public.store_info on conflict (store_id,key) do nothing;
insert into public.site_content(store_id,key,value)
select store_id,'store_sns_line',coalesce(line_url,'') from public.store_info on conflict (store_id,key) do nothing;
create or replace function public.sync_canonical_sns() returns trigger language plpgsql security definer set search_path=public as $$
begin
if new.key='store_sns_x' then update public.store_info set twitter_url=new.value where store_id=new.store_id;
elsif new.key='store_sns_line' then update public.store_info set line_url=new.value where store_id=new.store_id;
end if;
return new;
end $$;
drop trigger if exists canonical_sns_update on public.site_content;
create trigger canonical_sns_update after insert or update on public.site_content for each row execute function public.sync_canonical_sns();
update public.store_info i set twitter_url=s.value from public.site_content s where s.store_id=i.store_id and s.key='store_sns_x';
update public.store_info i set line_url=s.value from public.site_content s where s.store_id=i.store_id and s.key='store_sns_line';
