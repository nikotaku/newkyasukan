-- Create discounts table
CREATE TABLE IF NOT EXISTS public.discounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  discount_type  text NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value numeric NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discounts_select" ON public.discounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "discounts_insert" ON public.discounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "discounts_update" ON public.discounts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "discounts_delete" ON public.discounts FOR DELETE TO authenticated USING (true);

-- Initial discount options (edit as needed)
INSERT INTO public.discounts (name, discount_type, discount_value) VALUES
  ('初回割引',         'fixed',      1000),
  ('会員割引',         'percentage',   10),
  ('クーポン割引',     'fixed',      2000),
  ('誕生日割引',       'percentage',   15);
