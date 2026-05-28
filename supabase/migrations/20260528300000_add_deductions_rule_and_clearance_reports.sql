ALTER TABLE public.deductions ADD COLUMN IF NOT EXISTS rule text;

CREATE TABLE IF NOT EXISTS public.therapist_clearance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id uuid NOT NULL REFERENCES public.casts(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  orders_detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  deduction_items jsonb NOT NULL DEFAULT '[]',
  total_deduction integer NOT NULL DEFAULT 0,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE public.therapist_clearance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_clearance" ON public.therapist_clearance_reports FOR ALL USING (true) WITH CHECK (true);
