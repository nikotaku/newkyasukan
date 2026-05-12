alter table public.facility_contracts
  add column if not exists payment_method text;
