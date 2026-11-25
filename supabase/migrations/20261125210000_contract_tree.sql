alter table public.facility_contracts add column parent_id uuid references public.facility_contracts(id) on delete set null;
create index facility_contract_parent_idx on public.facility_contracts(parent_id);
create function public.check_facility_parent() returns trigger language plpgsql set search_path='' as $$
begin
 if new.parent_id is null then return new; end if;
 perform pg_advisory_xact_lock(72134118);
 if not exists(select from public.facility_contracts p where p.id=new.parent_id and p.store_id is not distinct from new.store_id) then
   raise exception '同じ店舗内の契約を選んでください';
 end if;
 if exists(with recursive chain as (
   select new.parent_id as id union select p.parent_id from public.facility_contracts p join chain c on c.id=p.id where p.parent_id is not null
 ) select from chain where id=new.id) then raise exception '自身や配下の契約には移動できません'; end if;
 return new;
end $$;
create trigger facility_contract_parent_check before insert or update of parent_id,store_id on public.facility_contracts for each row execute function public.check_facility_parent();
