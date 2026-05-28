ALTER TABLE public.closings
  ADD COLUMN IF NOT EXISTS expense_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE public.closings
  ADD COLUMN IF NOT EXISTS deduction_amount bigint NOT NULL DEFAULT 0;
