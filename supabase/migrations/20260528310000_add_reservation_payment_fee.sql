ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS payment_fee integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.payment_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_method TEXT NOT NULL UNIQUE,
  payment_link TEXT,
  fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_settings' AND policyname = 'allow_all_payment_settings') THEN
    CREATE POLICY "allow_all_payment_settings" ON public.payment_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.payment_settings (payment_method, payment_link, fee_percentage)
VALUES ('PayPay', '', 0), ('クレジットカード', '', 10)
ON CONFLICT (payment_method) DO NOTHING;

-- Default credit card fee to 10% if not yet configured
UPDATE public.payment_settings SET fee_percentage = 10 WHERE payment_method = 'クレジットカード' AND fee_percentage = 0;
