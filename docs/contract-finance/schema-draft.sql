-- Draft migration. Apply only after review and staging verification.
-- Scope is a store; the existing expense row remains the payment source of truth.
create table public.contract_investments (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 room_id uuid references public.rooms(id),
 name text not null,
 total_amount integer not null check(total_amount >= 0),
 allocation_amount integer check(allocation_amount between 0 and total_amount),
 allocation_months integer not null default 24 check(allocation_months between 1 and 1200),
 start_month date check(start_month = date_trunc('month',start_month)::date),
 funding_source text,
 notes text,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 unique(store_id,id)
);
create table public.contract_investment_items (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 investment_id uuid not null,
 name text not null,
 amount integer not null check(amount >= 0),
 eligible_amount integer check(eligible_amount between 0 and amount),
 expense_id uuid unique references public.expenses(id),
 receipt_path text,
 foreign key(store_id,investment_id) references public.contract_investments(store_id,id)
);
create table public.contract_loans (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 name text not null,
 lender text not null,
 borrowed_on date not null,
 principal integer not null check(principal > 0),
 repayment_start date,
 monthly_planned integer check(monthly_planned >= 0),
 notes text,
 archived_at timestamptz,
 unique(store_id,id)
);
create table public.contract_loan_installments (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 loan_id uuid not null,
 due_on date not null,
 planned_principal integer not null check(planned_principal >= 0),
 planned_interest integer not null default 0 check(planned_interest >= 0),
 actual_principal integer check(actual_principal >= 0),
 actual_interest integer check(actual_interest >= 0),
 paid_on date,
 expense_id uuid unique references public.expenses(id),
 foreign key(store_id,loan_id) references public.contract_loans(store_id,id),
 check((paid_on is null and actual_principal is null and actual_interest is null) or
       (paid_on is not null and actual_principal is not null and actual_interest is not null and expense_id is not null))
);
create table public.contract_investor_terms (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null unique references public.stores(id),
 received_amount integer not null check(received_amount > 0),
 received_on date,
 investor_rate_bps integer not null check(investor_rate_bps between 0 and 10000),
 capital_return_total integer not null check(capital_return_total between 0 and received_amount),
 return_installments integer not null check(return_installments > 0),
 notes text
);
-- Separate immutable monthly reports; later revisions are additional rows.
create table public.contract_monthly_reports (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 month_date date not null check(month_date = date_trunc('month',month_date)::date),
 revision integer not null check(revision > 0),
 source_closing_id uuid not null references public.monthly_closings(id),
 snapshot jsonb not null,
 revision_reason text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 unique(store_id,month_date,revision),
 unique(store_id,id),
 check(revision = 1 or nullif(btrim(revision_reason),'') is not null)
);
create table public.contract_investor_payments (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 report_id uuid,
 due_on date not null,
 kind text not null check(kind in ('profit','capital_return')),
 amount integer not null check(amount >= 0),
 paid_on date,
 notes text,
 foreign key(store_id,report_id) references public.contract_monthly_reports(store_id,id),
 check((kind='profit' and report_id is not null) or (kind='capital_return' and report_id is null))
);
create unique index contract_profit_payment_unique on public.contract_investor_payments(report_id) where kind='profit';
create unique index contract_capital_payment_unique on public.contract_investor_payments(store_id,due_on) where kind='capital_return';

do $$
declare t text;
begin
 foreach t in array array['contract_investments','contract_investment_items','contract_loans','contract_loan_installments','contract_investor_terms','contract_monthly_reports','contract_investor_payments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select, insert%s on public.%I to authenticated',case when t='contract_monthly_reports' then '' else ', update' end,t);
  execute format('create policy contract_admin_read on public.%I for select to authenticated using (exists (select 1 from public.user_stores m where m.user_id=(select auth.uid()) and m.store_id=%I.store_id and m.role in (''owner'',''manager'')))',t,t);
  execute format('create policy contract_admin_insert on public.%I for insert to authenticated with check (exists (select 1 from public.user_stores m where m.user_id=(select auth.uid()) and m.store_id=%I.store_id and m.role in (''owner'',''manager'')))',t,t);
  if t <> 'contract_monthly_reports' then
   execute format('create policy contract_admin_update on public.%I for update to authenticated using (exists (select 1 from public.user_stores m where m.user_id=(select auth.uid()) and m.store_id=%I.store_id and m.role in (''owner'',''manager''))) with check (exists (select 1 from public.user_stores m where m.user_id=(select auth.uid()) and m.store_id=%I.store_id and m.role in (''owner'',''manager'')))',t,t,t);
  end if;
 end loop;
end $$;
-- Do not expose bank/accounting figures to anon; no delete or update on report history.
-- TODO before deployment: validate cross-store room/expense/closing references, transactionally
-- finalize and validate snapshots, lock source periods, record payment adjustments, and add seed
-- after review of refundable deposits and the actual investment receipt and opening dates.
