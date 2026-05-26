ALTER TABLE public.casts
  ADD COLUMN IF NOT EXISTS target_customers text,
  ADD COLUMN IF NOT EXISTS customer_age_range text,
  ADD COLUMN IF NOT EXISTS mbti text,
  ADD COLUMN IF NOT EXISTS account_info text,
  ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '[]'::jsonb;