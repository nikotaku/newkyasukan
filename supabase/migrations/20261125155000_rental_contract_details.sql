alter table public.facility_contracts
  add column monthly_rent integer check (monthly_rent >= 0),
  add column common_fee integer check (common_fee >= 0),
  add column guarantor_name text,
  add column guarantee_period text,
  add column guarantee_renewal_fee integer check (guarantee_renewal_fee >= 0),
  add column resident_phone text,
  add column management_phone text;
notify pgrst, 'reload schema';
