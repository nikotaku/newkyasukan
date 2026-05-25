-- Add internal management fields to therapist_profiles
ALTER TABLE public.therapist_profiles
  ADD COLUMN IF NOT EXISTS sns_operation_notes text,
  ADD COLUMN IF NOT EXISTS love_type            text,
  ADD COLUMN IF NOT EXISTS customer_age_range   text;
