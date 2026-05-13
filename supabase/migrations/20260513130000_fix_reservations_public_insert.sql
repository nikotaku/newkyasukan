-- Allow public (unauthenticated) reservation inserts
ALTER TABLE public.reservations
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS course_type     TEXT,
  ADD COLUMN IF NOT EXISTS options         TEXT[],
  ADD COLUMN IF NOT EXISTS nomination_type TEXT,
  ADD COLUMN IF NOT EXISTS customer_furigana TEXT,
  ADD COLUMN IF NOT EXISTS payment_method  TEXT,
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

DROP POLICY IF EXISTS "Public can insert reservations" ON public.reservations;
CREATE POLICY "Public can insert reservations"
ON public.reservations
FOR INSERT
WITH CHECK (created_by IS NULL);

notify pgrst, 'reload schema';
