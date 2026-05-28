ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS transportation_fee bigint;
