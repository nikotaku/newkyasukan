-- Add キャスカン-style profile fields to casts table
ALTER TABLE public.casts
  ADD COLUMN IF NOT EXISTS name_kana text,
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS blood_type text,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS weight integer,
  ADD COLUMN IF NOT EXISTS bust_size text,
  ADD COLUMN IF NOT EXISTS shop_comment text,
  ADD COLUMN IF NOT EXISTS therapist_comment text,
  ADD COLUMN IF NOT EXISTS features text[],
  ADD COLUMN IF NOT EXISTS therapist_experience text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS hometown text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS body_size text,
  ADD COLUMN IF NOT EXISTS enrollment_period text,
  ADD COLUMN IF NOT EXISTS hobby text,
  ADD COLUMN IF NOT EXISTS celebrity_like text,
  ADD COLUMN IF NOT EXISTS uses_sns boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blog_url text,
  ADD COLUMN IF NOT EXISTS skebiy_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text;

NOTIFY pgrst, 'reload schema';
