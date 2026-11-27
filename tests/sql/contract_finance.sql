-- Run on an isolated fixture database only. Dates are historical to exercise closing.
begin;
do $test$
declare
 s constant uuid:='404499ab-5350-490f-9608-5814faffda6f';
 u uuid:=gen_random_uuid(); l uuid; e uuid; f jsonb; args jsonb;
begin
 begin perform public.enka_contract_finance('read'); raise exception 'read without membership'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.user_stores(user_id,store_id,role) values(u,s,'owner');
 assert (public.enka_contract_finance('read')->'investments'->0->>'start_month') is null;
 insert into public.daily_clearances(store_id,date,total_sales,therapist_back,misc_expenses,accommodation_fee,transportation_fee,other_expenses) values(s,'2025-02-01',3000000,1900000,0,0,0,'[]');
 insert into public.expenses(store_id,expense_date,amount,expense_type,is_paid) values(s,'2025-02-02',99000,'店舗費',true);
 update enka_finance.investment set start_month='2025-02-01';
 update enka_finance.item set eligible=amount;
 update enka_finance.terms set received='2025-01-01';
 perform public.enka_contract_finance('loan','{"name":"借入","lender":"銀行","borrowed":"2025-01-01","principal":400000,"starts":"2025-02-01","monthly":200000}');
 select id into strict l from enka_finance.loan;
 perform public.enka_contract_finance('repayment',jsonb_build_object('id',l,'due','2025-02-01','amount',201000,'interest',1000));
 select expense_id into strict e from enka_finance.repayment;
 f:=enka_finance.figures('2025-02-01'); assert (f->>'principal')::int=0;
 perform public.enka_contract_finance('repayment',jsonb_build_object('id',l,'expense_id',e,'paid_on','2025-02-03','interest',1000));
 f:=enka_finance.figures('2025-02-01');
 assert (f->>'ordinary')::int=2000000;
 assert (f->>'principal')::int=200000 and (f->>'profit')::int=785417;
 assert (f->>'investor')::int=235625 and (f->>'operator')::int=549792 and (f->>'total')::int=270625;
 assert f->>'due'='2025-03-17';
 args:=jsonb_build_object('month','2025-02-01','expected',f,'reconciled',true);
 perform public.enka_contract_finance('close',args);perform public.enka_contract_finance('close',args);
 assert (select count(*) from enka_finance.report)=1;
 update public.expenses set amount=100000 where expense_type='店舗費';
 assert (select figures->>'total' from enka_finance.report)='270625';
 perform public.enka_contract_finance('close',args||jsonb_build_object('reason','経費訂正','expected',enka_finance.figures('2025-02-01')));
 assert (select count(*) from enka_finance.report)=2;
 perform public.enka_contract_finance('pay','{"month":"2025-02-01","revision":2,"paid_on":"2025-03-17"}');
 perform public.enka_contract_finance('pay','{"month":"2025-02-01","revision":2,"paid_on":"2025-03-17"}');
 assert (select count(*) from enka_finance.transfer)=1;
 assert (enka_finance.figures('2027-01-01')->>'allocation')::int=14591;
 assert (select sum((enka_finance.figures(d::date)->>'allocation')::int) from generate_series('2025-02-01'::date,'2027-01-01'::date,interval '1 month')d)=350000;
 assert (enka_finance.figures('2025-03-01')->>'investor')::int=0;
 insert into public.daily_clearances(store_id,date,total_sales,therapist_back,misc_expenses,accommodation_fee,transportation_fee,other_expenses) values(s,'2025-08-01',100000,0,0,0,0,'[]');
 f:=enka_finance.figures('2025-08-01');assert (f->>'investor')::int>0 and (f->>'capital')::int=0;
 insert into public.expenses(store_id,expense_date,amount,expense_type,is_paid) values(s,'2025-02-01',35000,'購入',true) returning id into e;
 update enka_finance.item set expense_id=e,book_amount=0 where name='マットレス';
 assert (enka_finance.figures('2025-02-01')->>'ordinary')::int=2001000;
 assert not has_function_privilege('anon','public.enka_contract_finance(text,jsonb)','execute');
 assert not has_schema_privilege('authenticated','enka_finance','usage');
end $test$;
rollback;
