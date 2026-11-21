-- Only monthly target/settings records; operational facts remain in existing tables.
create table public.monthly_shift_kpi_settings (
 store_id uuid not null references public.stores(id),
 month date not null check (extract(day from month)=1),
 settings jsonb not null,
 locked boolean not null default false,
 revision integer not null default 1,
 primary key(store_id,month)
);
alter table public.monthly_shift_kpi_settings enable row level security;
create function public.kpi_admin(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_stores where user_id=auth.uid() and store_id=p_store and role in ('owner','manager'));
$$;
create policy kpi_admin_read on public.monthly_shift_kpi_settings for select to authenticated using(public.kpi_admin(store_id));
create function public.save_monthly_shift_kpi(p_store uuid,p_month date,p_settings jsonb,p_revision integer,p_lock boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare old_row public.monthly_shift_kpi_settings; member jsonb;
begin
 if not public.kpi_admin(p_store) then raise exception '管理者権限が必要です'; end if;
 if extract(day from p_month)<>1 or extract(year from p_month)<>2027 then raise exception '2027年の月初日を指定してください'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store::text||p_month::text,0));
 select * into old_row from public.monthly_shift_kpi_settings where store_id=p_store and month=p_month for update;
 if old_row.locked then raise exception '確定済み月の設定は変更できません'; end if;
 if coalesce(old_row.revision,0)<>p_revision then raise exception '設定が更新されました。再読込してください'; end if;
 if p_settings is null or not (p_settings ?& array['members','slots','treatments','perShift','unitPrice','warning','closed','blocks']) then raise exception '設定が不足しています'; end if;
 if jsonb_typeof(p_settings->'members')<>'array' or jsonb_typeof(p_settings->'closed')<>'array' or jsonb_typeof(p_settings->'blocks')<>'array' then raise exception '設定形式が不正です'; end if;
 if (select sum((m->>'target')::numeric) from jsonb_array_elements(p_settings->'members') m)<>(p_settings->>'slots')::numeric then raise exception '個人の出勤目標合計を月目標に合わせてください'; end if;
 if exists(select 1 from jsonb_array_elements(p_settings->'members') m where coalesce((m->>'target')::numeric,0)<=0 or (m->>'target')::numeric<>trunc((m->>'target')::numeric)) then raise exception '個人目標を確認してください'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_settings->'closed') d where date_trunc('month',d::date)::date<>p_month) or exists(select 1 from jsonb_array_elements(p_settings->'blocks') b where date_trunc('month',(b->>'date')::date)::date<>p_month or b->>'room' not in ('華月','艶月','朧月') or nullif(b->>'start','') is null or nullif(b->>'end','') is null or (b->>'start')::time=(b->>'end')::time) then raise exception '休業日・利用不可時間を確認してください'; end if;
 if p_lock and (p_month>=date_trunc('month',now() at time zone 'Asia/Tokyo')::date or exists(select 1 from jsonb_array_elements(p_settings->'members') m where nullif(m->>'id','') is null)) then raise exception '対象4名を設定し月終了後に確定してください'; end if;
 if jsonb_array_length(p_settings->'members')<>4 or (p_settings->>'slots')::numeric<=0 or (p_settings->>'treatments')::numeric<=0 or (p_settings->>'perShift')::numeric<=0 or (p_settings->>'unitPrice')::numeric<0 or (p_settings->>'warning')::numeric<=0 or (p_settings->>'warning')::numeric>100 then raise exception '目標値を確認してください'; end if;
 if (select count(*) from jsonb_array_elements(p_settings->'members') m where nullif(m->>'id','') is not null)<>(select count(distinct m->>'id') from jsonb_array_elements(p_settings->'members') m where nullif(m->>'id','') is not null) then raise exception '対象者は重複できません'; end if;
 for member in select * from jsonb_array_elements(p_settings->'members') loop
  if nullif(member->>'id','') is not null and not exists(select 1 from public.casts where id=(member->>'id')::uuid and store_id=p_store and cast_kind<>'w_group') then raise exception '対象者を確認してください'; end if;
 end loop;
 insert into public.monthly_shift_kpi_settings(store_id,month,settings,locked) values(p_store,p_month,p_settings,p_lock)
 on conflict(store_id,month) do update set settings=excluded.settings,locked=excluded.locked,revision=monthly_shift_kpi_settings.revision+1;
end;
$$;
create function public.get_monthly_shift_kpi(p_store uuid,p_year integer default 2027) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare first_day date:=make_date(p_year,1,1); last_day date:=make_date(p_year+1,1,1);
begin
 if not public.kpi_admin(p_store) then raise exception '管理者権限が必要です'; end if;
 return jsonb_build_object(
 'settings',coalesce((select jsonb_agg(t) from public.monthly_shift_kpi_settings t where store_id=p_store and month>=first_day and month<last_day),'[]'),
 'casts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',cast_kind)) from public.casts where store_id=p_store and not is_estama_dummy),'[]'),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('cast_id',cast_id,'date',shift_date,'start',start_time,'end',end_time,'room',room)) from public.shifts where store_id=p_store and shift_date>=first_day and shift_date<last_day and approval_status='approved' and status<>'cancelled'),'[]'),
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('cast_id',cast_id,'date',reservation_date,'status',status,'price',price)) from public.reservations where store_id=p_store and reservation_date>=first_day and reservation_date<last_day and status in ('completed','confirmed')),'[]'),
 'clearances',coalesce((select jsonb_agg(jsonb_build_object('cast_id',cast_id,'date',date,'sales',total_sales,'back',therapist_back)) from public.daily_clearances where store_id=p_store and date>=first_day and date<last_day and status='completed'),'[]')
 );
end;
$$;
revoke all on function public.kpi_admin(uuid) from public;
revoke all on function public.get_monthly_shift_kpi(uuid,integer) from public;
revoke all on function public.save_monthly_shift_kpi(uuid,date,jsonb,integer,boolean) from public;
grant execute on function public.kpi_admin(uuid),public.get_monthly_shift_kpi(uuid,integer),public.save_monthly_shift_kpi(uuid,date,jsonb,integer,boolean) to authenticated;
-- Seed month-specific IDs and labels once, never resolve historical membership by current name.
insert into public.monthly_shift_kpi_settings(store_id,month,settings)
select s.id,m::date,jsonb_build_object('slots',40,'treatments',120,'perShift',3,'unitPrice',30000,'warning',80,'closed',jsonb_build_array(),'blocks',jsonb_build_array(),
'members',jsonb_build_array(
 jsonb_build_object('id',(select id from public.casts where store_id=s.id and name='望月せな' limit 1),'name','望月せな','target',10,'training',''),
 jsonb_build_object('id',(select id from public.casts where store_id=s.id and name='桐生まい' limit 1),'name','桐生まい','target',10,'training',''),
 jsonb_build_object('id',null,'name','育成セラピスト①','target',10,'training',''),
 jsonb_build_object('id',null,'name','育成セラピスト②','target',10,'training','')))
from public.stores s cross join generate_series('2027-01-01'::date,'2027-12-01'::date,'1 month') m
where s.custom_domain='enka-salon.jp' or s.name like '%艶華%'
on conflict do nothing;
