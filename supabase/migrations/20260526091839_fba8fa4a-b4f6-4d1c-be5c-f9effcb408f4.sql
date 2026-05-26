
-- Add rule column to deductions
ALTER TABLE public.deductions ADD COLUMN IF NOT EXISTS rule text;

-- New advertising_expenses settings table
CREATE TABLE IF NOT EXISTS public.advertising_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  rule text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advertising_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage advertising expenses"
ON public.advertising_expenses
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_advertising_expenses_updated_at
BEFORE UPDATE ON public.advertising_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
