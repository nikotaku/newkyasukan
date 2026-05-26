
CREATE TABLE IF NOT EXISTS public.advertising_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, platform TEXT NOT NULL DEFAULT '', cost INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, allowance_type TEXT NOT NULL DEFAULT 'fixed', amount INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.card_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, amount INTEGER NOT NULL DEFAULT 0, transaction_count INTEGER NOT NULL DEFAULT 0,
  card_type TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id UUID NOT NULL, sender_name TEXT NOT NULL DEFAULT '匿名', message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cast_site_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id UUID NOT NULL, site TEXT NOT NULL, login_id TEXT, login_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cast_id, site)
);
CREATE TABLE IF NOT EXISTS public.cleaning_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, cast_id UUID, submitted_by UUID, details JSONB DEFAULT '{}'::jsonb, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL, period_date DATE NOT NULL,
  total_sales INTEGER NOT NULL DEFAULT 0, total_reservations INTEGER NOT NULL DEFAULT 0,
  notes TEXT, closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_date)
);
CREATE TABLE IF NOT EXISTS public.daily_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, cast_id UUID, submitted_by UUID, rating INTEGER, customer_feedback TEXT,
  details JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.daily_sales_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, cash_amount INTEGER NOT NULL DEFAULT 0, card_amount INTEGER NOT NULL DEFAULT 0,
  paypay_amount INTEGER NOT NULL DEFAULT 0, total_amount INTEGER NOT NULL DEFAULT 0,
  submitted_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.daily_sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE, target_amount INTEGER NOT NULL DEFAULT 0, actual_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, deduction_type TEXT NOT NULL DEFAULT 'fixed', amount INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, discount_type TEXT NOT NULL DEFAULT 'fixed', discount_value INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.monthly_sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_date DATE NOT NULL UNIQUE, target_revenue INTEGER NOT NULL DEFAULT 0, target_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.paypay_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, amount INTEGER NOT NULL DEFAULT 0, transaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.price_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0, sales_count INTEGER NOT NULL DEFAULT 0,
  total_revenue INTEGER NOT NULL DEFAULT 0, percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.referral_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL, referrer_name TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL DEFAULT '',
  commission_rate NUMERIC NOT NULL DEFAULT 0, sales_amount INTEGER NOT NULL DEFAULT 0, fee INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE, category TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0,
  description TEXT, payment_method TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sms_auto_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT '', timing_minutes INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sns_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
  management_url TEXT DEFAULT '', login_id TEXT DEFAULT '', login_password TEXT DEFAULT '',
  email TEXT DEFAULT '', profile_link TEXT DEFAULT '', published_to_hp BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.store_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', address TEXT DEFAULT '',
  phone TEXT DEFAULT '', email TEXT DEFAULT '', hours TEXT DEFAULT '', holiday TEXT DEFAULT '',
  lat NUMERIC, lng NUMERIC, twitter_url TEXT, line_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL, content TEXT, color TEXT NOT NULL DEFAULT '#cccccc',
  is_folder BOOLEAN NOT NULL DEFAULT false, parent_id UUID, display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.therapist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id UUID NOT NULL UNIQUE, tags TEXT[] DEFAULT '{}', weight NUMERIC,
  self_introduction TEXT DEFAULT '', comment TEXT DEFAULT '', special_skills TEXT DEFAULT '',
  preferred_type TEXT DEFAULT '', mbti TEXT DEFAULT '', love_type TEXT DEFAULT '',
  career_history TEXT DEFAULT '', massage_skills TEXT DEFAULT '', training_count INTEGER,
  sns_operation_notes TEXT DEFAULT '', customer_age_range TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.therapist_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, total_sales INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0, average_visit_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS + admin policies for all (idempotent via DO blocks)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'advertising_costs','allowances','card_sales','cast_messages','cast_site_credentials',
    'cleaning_checklists','closings','daily_feedback','daily_sales_records','daily_sales_targets',
    'deductions','discounts','knowledge_documents','monthly_sales_targets','paypay_sales',
    'price_analysis','referral_fees','sales_expenses','sms_auto_templates','sms_logs',
    'sns_accounts','store_info','text_templates','therapist_profiles','therapist_sales'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON public.%I', t);
    EXECUTE format('CREATE POLICY admin_all ON public.%I FOR ALL TO public USING (has_role(auth.uid(),''admin''::app_role)) WITH CHECK (has_role(auth.uid(),''admin''::app_role))', t);
  END LOOP;
END $$;

-- Public/anonymous overrides
DROP POLICY IF EXISTS admin_all ON public.cast_messages;
CREATE POLICY "Public can post cast messages" ON public.cast_messages FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins view cast messages" ON public.cast_messages FOR SELECT TO public USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete cast messages" ON public.cast_messages FOR DELETE TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.cleaning_checklists;
CREATE POLICY "Anyone insert cleaning" ON public.cleaning_checklists FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins view cleaning" ON public.cleaning_checklists FOR SELECT TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.daily_feedback;
CREATE POLICY "Anyone insert feedback" ON public.daily_feedback FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins view feedback" ON public.daily_feedback FOR SELECT TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.daily_sales_records;
CREATE POLICY "Anyone insert daily sales" ON public.daily_sales_records FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins view daily sales" ON public.daily_sales_records FOR SELECT TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.discounts;
CREATE POLICY "Public view discounts" ON public.discounts FOR SELECT TO public USING (true);
CREATE POLICY "Admins insert discounts" ON public.discounts FOR INSERT TO public WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update discounts" ON public.discounts FOR UPDATE TO public USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete discounts" ON public.discounts FOR DELETE TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.knowledge_documents;
CREATE POLICY "Auth view knowledge docs" ON public.knowledge_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert knowledge docs" ON public.knowledge_documents FOR INSERT TO public WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update knowledge docs" ON public.knowledge_documents FOR UPDATE TO public USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete knowledge docs" ON public.knowledge_documents FOR DELETE TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.store_info;
CREATE POLICY "Public view store info" ON public.store_info FOR SELECT TO public USING (true);
CREATE POLICY "Admins insert store info" ON public.store_info FOR INSERT TO public WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update store info" ON public.store_info FOR UPDATE TO public USING (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS admin_all ON public.therapist_profiles;
CREATE POLICY "Public view therapist profiles" ON public.therapist_profiles FOR SELECT TO public USING (true);
CREATE POLICY "Admins insert therapist profiles" ON public.therapist_profiles FOR INSERT TO public WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update therapist profiles" ON public.therapist_profiles FOR UPDATE TO public USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete therapist profiles" ON public.therapist_profiles FOR DELETE TO public USING (has_role(auth.uid(),'admin'::app_role));

-- rooms additional columns
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS access TEXT,
  ADD COLUMN IF NOT EXISTS map_address TEXT,
  ADD COLUMN IF NOT EXISTS map_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_text TEXT,
  ADD COLUMN IF NOT EXISTS email_text TEXT,
  ADD COLUMN IF NOT EXISTS cast_guide TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS reset_procedure TEXT,
  ADD COLUMN IF NOT EXISTS cleaning_manual TEXT;
