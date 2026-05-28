-- セラピストごとの日次清算テーブル
CREATE TABLE IF NOT EXISTS public.daily_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id uuid NOT NULL REFERENCES public.casts(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_sales integer NOT NULL DEFAULT 0,
  therapist_back integer NOT NULL DEFAULT 0,
  misc_expenses integer NOT NULL DEFAULT 0,
  accommodation_fee integer NOT NULL DEFAULT 0,
  payout_amount integer NOT NULL DEFAULT 0,
  payout_method text,
  status text NOT NULL DEFAULT 'pending',
  points_awarded numeric NOT NULL DEFAULT 0.5,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cast_id, date)
);

ALTER TABLE public.daily_clearances ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_daily_clearances
  ON public.daily_clearances FOR ALL USING (true) WITH CHECK (true);

-- セラピストへのポイント累積
ALTER TABLE public.casts ADD COLUMN IF NOT EXISTS total_points numeric NOT NULL DEFAULT 0;
