create table if not exists public.monthly_reports (
  month_date   date        primary key,
  revenue      bigint,
  customer_count integer,
  session_count  integer,
  new_customers  integer,
  repeat_customers integer,
  therapist_pay  bigint,
  discount       bigint,
  gross_profit   bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.monthly_reports enable row level security;

create policy "Authenticated users can read monthly_reports"
  on public.monthly_reports for select
  to authenticated using (true);

create policy "Authenticated users can insert monthly_reports"
  on public.monthly_reports for insert
  to authenticated with check (true);

create policy "Authenticated users can update monthly_reports"
  on public.monthly_reports for update
  to authenticated using (true);

insert into public.monthly_reports
  (month_date, revenue, customer_count, session_count, new_customers, repeat_customers, therapist_pay, discount, gross_profit)
values
  ('2026-05-01', 1286800,  42,  49,  24,  25,  856000,  16800,  414000),
  ('2026-04-01', 1978900,  58,  74,  32,  42, 1305000, -51000,  724900),
  ('2026-03-01', 2410500,  62,  89,  34,  55, 1603000, -58000,  865500),
  ('2026-02-01', 2031500,  58,  71,  30,  41, 1347000, -37000,  721500),
  ('2026-01-01', 4414600,  74, 166,  89,  77, 2948000, -98190, 1564790),
  ('2025-12-01', 3940100,  68, 152,  96,  56, 2636000,-117390, 1421490),
  ('2025-11-01', 3216900,  53, 126,  81,  45, 2142000, -68000, 1142900),
  ('2025-10-01', 3616000,  63, 142,  87,  55, 2363000, -64300, 1317300),
  ('2025-09-01', 1548900,  53,  61,  34,  27, 1037000, -45000,  556900),
  ('2025-08-01', 3649400,  65, 140, 100,  40, 2405000, -79860, 1324260),
  ('2025-07-01', 3004300,  55, 114,  95,  19, 2009000, -61000, 1056300),
  ('2025-05-01', 1068400,  94,  58,  50,   8,  656000,    null,  412400),
  ('2025-04-01',  974500,  74,  48,  39,   9,  616000,    null,  358500),
  ('2025-03-01',  598000,  89,  27,  23,   4,  393000,    null,  205000),
  ('2025-02-01',  634000,  68,  34,  30,   4,  392000,    null,  242000),
  ('2025-01-01',  684900,  83,  39,  30,   9,  433000,    null,  251900),
  ('2024-12-01',  873000, 127,  45,  28,  17,  529000,    null,  344000),
  ('2024-11-01',  904800, 169,  45,  31,  14,  564000,    null,  340800),
  ('2024-10-01',  822000, 102,  42,  29,  13,  507000,    null,  315000)
on conflict (month_date) do update set
  revenue          = excluded.revenue,
  customer_count   = excluded.customer_count,
  session_count    = excluded.session_count,
  new_customers    = excluded.new_customers,
  repeat_customers = excluded.repeat_customers,
  therapist_pay    = excluded.therapist_pay,
  discount         = excluded.discount,
  gross_profit     = excluded.gross_profit,
  updated_at       = now();

notify pgrst, 'reload schema';
