
ALTER TABLE public.casts 
  ADD COLUMN IF NOT EXISTS line_url text,
  ADD COLUMN IF NOT EXISTS litlink_url text,
  ADD COLUMN IF NOT EXISTS x_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS type text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS first_visit_date date,
  ADD COLUMN IF NOT EXISTS last_visit_date date,
  ADD COLUMN IF NOT EXISTS visit_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent numeric DEFAULT 0;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS discount_ids uuid[] DEFAULT '{}';
