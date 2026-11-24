-- Private, single-store contract ledger. Only the checked RPC below is exposed.
create schema enka_finance;
revoke all on schema enka_finance from public,anon,authenticated;
create table enka_finance.assigned_expense(expense_id uuid primary key references public.expenses on delete cascade, actor uuid not null);
create view enka_finance.expense_source as select e.* from public.expenses e where
 e.store_id='404499ab-5350-490f-9608-5814faffda6f' or exists(select from enka_finance.assigned_expense s where s.expense_id=e.id);
create function public.enka_expense_assignment(p_month date, p_id uuid default null, p_include boolean default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,enka_finance,pg_temp as $$
declare old_store constant uuid:='00000000-0000-0000-0000-000000000001';
begin
 if not exists(select from public.user_stores where user_id=auth.uid() and store_id=old_store and role in ('manager','owner')) then raise insufficient_privilege; end if;
 if p_id is not null then
 perform pg_advisory_xact_lock(771391144);
 if not exists(select from public.expenses where id=p_id and store_id=old_store and expense_date>=p_month and expense_date<p_month+interval '1 month') then raise exception '対象経費が見つかりません'; end if;
 if p_include then insert into assigned_expense values(p_id,auth.uid()) on conflict do nothing;
 elsif exists(select from item where expense_id=p_id) or exists(select from repayment where expense_id=p_id) then raise exception '投資または返済と連携済みです';
 else delete from assigned_expense where expense_id=p_id; end if;
 end if;
 return (select coalesce(jsonb_agg(s.expense_id),'[]') from assigned_expense s join public.expenses e on e.id=s.expense_id where e.expense_date>=p_month and e.expense_date<p_month+interval '1 month');
end $$;
revoke all on function public.enka_expense_assignment(date,uuid,boolean) from public,anon,authenticated;
grant execute on function public.enka_expense_assignment(date,uuid,boolean) to authenticated;
create table enka_finance.investment(
 id uuid primary key default gen_random_uuid(), name text not null check(trim(name)<>''), room_id uuid not null references public.rooms,
 months integer not null check(months between 1 and 1200), start_month date check(extract(day from start_month)=1),
 funding text not null default '', notes text not null default '', archived boolean not null default false);
create table enka_finance.item(
 id uuid primary key default gen_random_uuid(), investment_id uuid not null references enka_finance.investment,
 name text not null check(trim(name)<>''), amount integer not null check(amount>=0),
 eligible integer check(eligible between 0 and amount), expense_id uuid unique references public.expenses,
 book_amount integer check(book_amount between 0 and amount), receipt text not null default '');
create table enka_finance.loan(
 id uuid primary key default gen_random_uuid(),name text not null check(trim(name)<>''), lender text not null check(trim(lender)<>''),
 borrowed date not null, principal integer not null check(principal>0), starts date not null check(starts>=borrowed),
 monthly integer not null check(monthly>0));
create table enka_finance.repayment(
 expense_id uuid primary key references public.expenses, loan_id uuid not null references enka_finance.loan,
 paid_on date, interest integer not null check(interest>=0));
create table enka_finance.terms(
 singleton boolean primary key default true check(singleton), received date, amount integer not null check(amount>0),
 rate integer not null check(rate between 0 and 10000), capital integer not null check(capital between 0 and amount),
 installments integer not null check(installments between 1 and 1200));
create table enka_finance.report(
 month date not null, revision integer not null, figures jsonb not null,reason text not null,
 actor uuid not null, recorded_at timestamptz not null default now(),primary key(month,revision));
create table enka_finance.transfer(
 month date primary key,revision integer not null, paid_on date not null,actor uuid not null,
 foreign key(month,revision) references enka_finance.report);
create table enka_finance.holiday(day date primary key);
create table enka_finance.calendar_year(year integer primary key);
insert into enka_finance.terms(amount,rate,capital,installments) values(350000,3000,105000,3);
with inv as (insert into enka_finance.investment(name,room_id,months,funding)
values('朧月開設費用','59ba1c3d-f512-4478-8bb8-ea0564917ad1',24,'出資金') returning id)
insert into enka_finance.item(investment_id,name,amount,eligible)
select inv.id,v.* from inv cross join (values ('乾燥機',9000,9000),('マットレス',35000,35000),('名義関連費用',70000,70000),
 ('物件初期費用',210000,null::integer),('その他備品',26000,26000)) v;
-- Cabinet Office syukujitsu.csv, through 2027. Unknown calendar years have no confirmed due date.
insert into enka_finance.holiday values ('2025-01-01'),('2025-01-13'),('2025-02-11'),('2025-02-23'),('2025-02-24'),('2025-03-20'),('2025-04-29'),('2025-05-03'),('2025-05-04'),('2025-05-05'),('2025-05-06'),('2025-07-21'),('2025-08-11'),('2025-09-15'),('2025-09-23'),('2025-10-13'),('2025-11-03'),('2025-11-23'),('2025-11-24'),('2026-01-01'),('2026-01-12'),('2026-02-11'),('2026-02-23'),('2026-03-20'),('2026-04-29'),('2026-05-03'),('2026-05-04'),('2026-05-05'),('2026-05-06'),('2026-07-20'),('2026-08-11'),('2026-09-21'),('2026-09-22'),('2026-09-23'),('2026-10-12'),('2026-11-03'),('2026-11-23'),('2027-01-01'),('2027-01-11'),('2027-02-11'),('2027-02-23'),('2027-03-21'),('2027-03-22'),('2027-04-29'),('2027-05-03'),('2027-05-04'),('2027-05-05'),('2027-07-19'),('2027-08-11'),('2027-09-20'),('2027-09-23'),('2027-10-11'),('2027-11-03'),('2027-11-23');
insert into enka_finance.calendar_year values (2025),(2026),(2027);
create function enka_finance.month_gap(a date,b date) returns int language sql immutable strict as $$
 select ((extract(year from a)-extract(year from b))*12+extract(month from a)-extract(month from b))::int $$;
create function enka_finance.portion(total bigint, n integer, idx integer) returns bigint language sql immutable as $$
 select case when idx=n-1 then total-(total/n)*(n-1) when idx between 0 and n-1 then total/n else 0 end $$;
create function enka_finance.bank_day(d date) returns date language sql stable as $$
 select min(dt::date) from generate_series(d::timestamp,d+interval '20 days','1 day') dt
 where exists(select from enka_finance.calendar_year where year=extract(year from dt))
 and extract(isodow from dt)<6 and to_char(dt,'MMDD') not in ('0101','0102','0103','1231')
 and not exists(select from enka_finance.holiday where day=dt::date) $$;

create function enka_finance.figures(m date) returns jsonb language plpgsql stable set search_path=pg_catalog,enka_finance,pg_temp as $$
declare
 sid constant uuid:='404499ab-5350-490f-9608-5814faffda6f';
 until_date date:=(m+interval '1 month')::date;
 sales bigint; payroll bigint; ledger bigint; interest_principal bigint; purchase bigint; book_purchase bigint; book_only bigint; allocated bigint;
 actual bigint; ordinary bigint; profit bigint; investor bigint; capital_due bigint; terms_row terms%rowtype;
begin
 select * into strict terms_row from terms;
 select coalesce(sum(c.total_sales-x.refunds),0),coalesce(sum(c.therapist_back-c.misc_expenses-c.accommodation_fee+c.transportation_fee+x.adjustments),0)
 into sales,payroll from public.daily_clearances c cross join lateral (
 select coalesce(sum(case when kind in ('salary_addition','shortage_offset','cash_return') and refund then val else 0 end),0) refunds,
 coalesce(sum(case when kind not in ('salary_addition','shortage_offset','cash_return') then -val
 when kind='salary_addition' and not refund and not offsetting then val else 0 end),0) adjustments
 from (select coalesce(e->>'kind','deduction') kind,coalesce(e->>'kind'='cash_return',false) or coalesce(e->>'source_return_id','')<>'' refund,
 coalesce(e->>'source_clearance_id','')<>'' offsetting,
 case when e->>'amount' ~ '^[0-9]+$' then (e->>'amount')::bigint else 0 end val
 from jsonb_array_elements(case when jsonb_typeof(c.other_expenses)='array' then c.other_expenses else '[]'::jsonb end) e) parts) x
 where c.store_id=sid and c.date>=m and c.date<until_date;
 select coalesce(sum(e.amount),0),coalesce(sum(case when r.expense_id is not null then e.amount-r.interest else 0 end),0),
 coalesce(sum(i.amount),0),coalesce(sum(i.book_amount),0),coalesce(sum(case when e.expense_type='会計減価償却' then e.amount else 0 end),0)
 into ledger,interest_principal,purchase,book_purchase,book_only from expense_source e left join repayment r on r.expense_id=e.id left join item i on i.expense_id=e.id
 where e.expense_date>=m and e.expense_date<until_date
 and not(e.expense_type='交通費' and coalesce(e.description,'') like '日別清算より%');
 select coalesce(sum(portion(v.base,v.months,month_gap(m,v.start_month))),0) into allocated from
 (select a.id,a.start_month,a.months,sum(i.eligible) base from investment a join item i on i.investment_id=a.id
 group by a.id having bool_and(i.eligible is not null)) v;
 select coalesce(sum(e.amount-r.interest),0) into actual from repayment r join public.expenses e on e.id=r.expense_id
 where e.is_paid and r.paid_on>=m and r.paid_on<until_date;
 ordinary:=payroll+ledger-interest_principal-purchase-book_only;
 profit:=sales-ordinary-allocated-actual;
 investor:=case when month_gap(m,terms_row.received)>=1 then floor(greatest(profit,0)::numeric*terms_row.rate/10000)::bigint else 0 end;
 capital_due:=portion(terms_row.capital,terms_row.installments,month_gap(until_date,terms_row.received)-2);
 return jsonb_build_object('sales',sales,'payroll',payroll,'ledger',ledger,'ordinary',ordinary,'allocation',allocated,'principal',actual,
 'profit',profit,'operator',greatest(profit,0)-investor,'investor',investor,'capital',capital_due,'total',investor+capital_due,
 'due',bank_day(until_date+14),'rate',terms_row.rate,'accountingExpenses',ordinary+book_purchase+book_only,
 'accountingProfit',sales-ordinary-book_purchase-book_only);
end $$;
-- Linked repayments use the payment ledger's amount and paid flag. Protect splits when the ledger changes.
create function enka_finance.protect_link() returns trigger language plpgsql security definer set search_path=pg_catalog,enka_finance,pg_temp as $$
begin
 if (exists(select from item where expense_id=old.id) or exists(select from repayment where expense_id=old.id))
 and (new.amount,new.store_id,new.expense_type,new.expense_date) is distinct from (old.amount,old.store_id,old.expense_type,old.expense_date)
 then raise exception '投資・返済管理との関連付けを確認してください'; end if;
 if new.is_paid and not old.is_paid and exists(select from repayment where expense_id=old.id and paid_on is null)
 then raise exception '借入・返済管理で実際の返済日を登録してください'; end if;
 if old.is_paid and not new.is_paid then update repayment set paid_on=null where expense_id=old.id; end if;
 return new;
end $$;
create trigger contract_finance_link before update on public.expenses for each row execute function enka_finance.protect_link();

create function public.enka_contract_finance(action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,enka_finance,pg_temp as $$
declare
 sid constant uuid:='404499ab-5350-490f-9608-5814faffda6f';
 m date:=coalesce((p->>'month')::date,date_trunc('month',now() at time zone 'Asia/Tokyo')::date);
 uid uuid:=auth.uid(); k uuid:=nullif(p->>'id','')::uuid; ex uuid; room uuid; part jsonb; expense_row public.expenses%rowtype;
 prev report%rowtype; f jsonb; terms_row terms%rowtype; loan_row loan%rowtype; paid date; interest_yen int;
begin
 if uid is null or not exists(select from public.user_stores where store_id=sid and user_id=uid and role in ('owner','manager'))
 then raise exception '艶華の管理者権限が必要です' using errcode='42501'; end if;
 if extract(day from m)<>1 then raise exception '対象月が不正です'; end if;
 if action<>'read' then perform pg_advisory_xact_lock(771391144); end if;
 case action
 when 'read' then
 return jsonb_build_object('terms',(select to_jsonb(t) from terms t),'figures',figures(m),
 'rooms',(select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.rooms where store_id=sid),
 'investments',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by i.id) from item i where i.investment_id=a.id)) order by a.name) from investment a),'[]'),
 'loans',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('payments',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('amount',e.amount,'is_paid',e.is_paid,'due',e.expense_date) order by e.expense_date) from repayment r join public.expenses e on e.id=r.expense_id where r.loan_id=l.id),'[]'))) from loan l),'[]'),
 'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',expense_type,'date',expense_date,'amount',amount,'paid',is_paid) order by expense_date desc) from expense_source where expense_date>=m and expense_date<m+interval '1 month' and not(expense_type='交通費' and coalesce(description,'') like '日別清算より%')),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h)-'actor' order by revision desc) from report h where h.month=m),'[]'),
 'months',coalesce((select jsonb_agg(distinct month order by month) from report),'[]'),
 'paid',(select paid_on from transfer where month=m));
 when 'investment' then
 room:=(p->>'room_id')::uuid;
 if not exists(select from public.rooms where id=room and store_id=sid) or jsonb_typeof(p->'items') is distinct from 'array' then raise exception 'ルームと内訳を指定してください'; end if;
 if jsonb_array_length(p->'items')=0 then raise exception '内訳が必要です'; end if;
 if k is null then insert into investment(name,room_id,months) values(p->>'name',room,(p->>'months')::int) returning id into k; end if;
 update investment set name=p->>'name',room_id=room,months=(p->>'months')::int,start_month=nullif(p->>'start_month','')::date,
 funding=p->>'funding',notes=p->>'notes' where id=k;
 delete from item where investment_id=k;
 for part in select value from jsonb_array_elements(p->'items') loop
 ex:=nullif(part->>'expense_id','')::uuid;
 if ex is not null then
 select * into strict expense_row from expense_source where id=ex for update;
 if exists(select from repayment where expense_id=ex) or expense_row.amount<>(part->>'amount')::int or (expense_row.expense_type='交通費' and coalesce(expense_row.description,'') like '日別清算より%') then raise exception '経費の金額または用途が一致しません'; end if; end if;
 insert into item(investment_id,name,amount,eligible,book_amount,expense_id,receipt) values(k,part->>'name',(part->>'amount')::int,nullif(part->>'eligible','')::int,nullif(part->>'book_amount','')::int,ex,coalesce(part->>'receipt',''));
 end loop;
 when 'archive' then update investment set archived=(p->>'archived')::boolean where id=k;
 when 'loan' then
 insert into loan(name,lender,borrowed,principal,starts,monthly) values(p->>'name',p->>'lender',(p->>'borrowed')::date,(p->>'principal')::int,(p->>'starts')::date,(p->>'monthly')::int);
 when 'repayment' then
 select * into strict loan_row from loan where id=k;
 ex:=nullif(p->>'expense_id','')::uuid; paid:=nullif(p->>'paid_on','')::date; interest_yen:=(p->>'interest')::int;
 if paid>timezone('Asia/Tokyo',now())::date or paid<loan_row.borrowed then raise exception '実績日を確認してください'; end if;
 if ex is null then
 insert into public.expenses(store_id,expense_date,expense_type,amount,is_paid,description)
 values(sid,(p->>'due')::date,'借入返済',(p->>'amount')::int,paid is not null,loan_row.name) returning id into ex; end if;
 select * into strict expense_row from expense_source where id=ex for update;
 if exists(select from item where expense_id=ex) or exists(select from repayment where expense_id=ex and loan_id<>k)
 or expense_row.amount<interest_yen or interest_yen<0 or (expense_row.is_paid and paid is null) or (expense_row.expense_type='交通費' and coalesce(expense_row.description,'') like '日別清算より%')
 then raise exception '支払元データ・実績日・利息を確認してください'; end if;
 insert into repayment values(ex,k,paid,interest_yen) on conflict(expense_id) do update set paid_on=excluded.paid_on,interest=excluded.interest;
 if paid is not null then update public.expenses set is_paid=true where id=ex; end if;
 if (select sum(x.amount-r.interest) from repayment r join public.expenses x on x.id=r.expense_id where r.loan_id=k)>loan_row.principal then raise exception '返済元本が借入額を超えます'; end if;
 when 'calendar' then
 if jsonb_typeof(p->'dates') is distinct from 'array' or jsonb_array_length(p->'dates') not between 15 and 30 then raise exception '祝日CSVの対象年を確認してください'; end if;
 if exists(select from jsonb_array_elements_text(p->'dates') d where extract(year from d::date)<>(p->>'year')::int)
 or not (p->'dates' ? ((p->>'year')||'-01-01')) then raise exception '祝日の年が一致しません'; end if;
 delete from holiday where extract(year from day)=(p->>'year')::int;
 insert into holiday select distinct d::date from jsonb_array_elements_text(p->'dates') d;
 insert into calendar_year values((p->>'year')::int) on conflict do nothing;
 when 'terms' then update terms set received=nullif(p->>'received','')::date,amount=(p->>'amount')::int,rate=(p->>'rate')::int,capital=(p->>'capital')::int,installments=(p->>'installments')::int;
 when 'close','pay' then
 select * into prev from report where month=m order by revision desc limit 1;
 if action='pay' then
 paid:=(p->>'paid_on')::date;
 if (p->>'revision')::int is distinct from prev.revision or prev.revision is null or (prev.figures->>'total')::bigint<=0 or paid>timezone('Asia/Tokyo',now())::date then raise exception '確定済みの支払と実績日を確認してください'; end if;
 insert into transfer values(m,prev.revision,paid,uid) on conflict(month) do nothing;
 else
 select * into strict terms_row from terms;
 if m>=date_trunc('month',now() at time zone 'Asia/Tokyo')::date or terms_row.received is null or p->>'reconciled' is distinct from 'true'
 then raise exception '締め済み対象月・出資受領日・経費照合を確認してください'; end if;
 if exists(select from investment a join item i on i.investment_id=a.id where (a.start_month<=m and i.eligible is null) or
 (i.expense_id is not null and i.book_amount is null and exists(select from public.expenses x where x.id=i.expense_id and date_trunc('month',x.expense_date)::date=m))) then raise exception '投資内訳の対象額・会計費用を確認してください'; end if;
 f:=figures(m);
 if p->'expected' is distinct from f then raise exception '元データが更新されました。再読込して確認してください'; end if;
 if f->>'due' is null then raise exception '対象年の銀行休日が未登録です'; end if;
 if prev.figures=f then return 'true'; end if;
 if exists(select from transfer where month=m) then raise exception '支払済みです'; end if;
 if prev.revision is not null and trim(coalesce(p->>'reason',''))='' then raise exception '変更理由が必要です'; end if;
 insert into report values(m,coalesce(prev.revision,0)+1,f,coalesce(p->>'reason',''),uid,now());
 end if;
 else raise exception '不正な操作です';
 end case;
 return 'true'::jsonb;
end $$;
revoke all on function public.enka_contract_finance(text,jsonb) from public,anon,authenticated;
grant execute on function public.enka_contract_finance(text,jsonb) to authenticated;
-- Existing payment screens still read the source expense. Linked financial rows are admin-only.
create function enka_finance.can_view_expense(k uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,enka_finance,pg_temp as $$
 select not exists(select from repayment where expense_id=k union all select from item where expense_id=k)
 or exists(select from public.user_stores m join public.expenses e on e.id=k and e.store_id=m.store_id
 where m.user_id=auth.uid() and m.role in ('owner','manager')) $$;
revoke all on function enka_finance.can_view_expense(uuid) from public;
grant execute on function enka_finance.can_view_expense(uuid) to authenticated;
create policy contract_linked_admin on public.expenses as restrictive for all to authenticated
 using (enka_finance.can_view_expense(id)) with check (enka_finance.can_view_expense(id));
