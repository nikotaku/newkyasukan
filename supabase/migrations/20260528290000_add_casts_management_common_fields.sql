ALTER TABLE public.casts
  ADD COLUMN IF NOT EXISTS customer_base_memo text,
  ADD COLUMN IF NOT EXISTS referral_route text,
  ADD COLUMN IF NOT EXISTS interview_sheet_url text;
