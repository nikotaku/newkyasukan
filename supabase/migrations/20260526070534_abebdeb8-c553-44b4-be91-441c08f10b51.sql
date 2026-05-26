
-- customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_visited DATE,
  total_spent INTEGER NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  ban_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- customer_ng_casts
CREATE TABLE public.customer_ng_casts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cast_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, cast_id)
);
ALTER TABLE public.customer_ng_casts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ng casts" ON public.customer_ng_casts FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- monthly_reports
CREATE TABLE public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_date DATE NOT NULL UNIQUE,
  revenue INTEGER DEFAULT 0,
  gross_profit INTEGER DEFAULT 0,
  target_revenue INTEGER DEFAULT 0,
  target_amount INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage monthly reports" ON public.monthly_reports FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_monthly_reports_updated_at BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- hp_articles
CREATE TABLE public.hp_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'news',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hp_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published articles" ON public.hp_articles FOR SELECT TO public
  USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert articles" ON public.hp_articles FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update articles" ON public.hp_articles FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete articles" ON public.hp_articles FOR DELETE TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_hp_articles_updated_at BEFORE UPDATE ON public.hp_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- hp_analytics_daily
CREATE TABLE public.hp_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hp_analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view daily analytics" ON public.hp_analytics_daily FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- hp_analytics_pages
CREATE TABLE public.hp_analytics_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL UNIQUE,
  page_title TEXT,
  avg_stay_seconds INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hp_analytics_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view page analytics" ON public.hp_analytics_pages FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- hp_analytics_hourly
CREATE TABLE public.hp_analytics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour INTEGER NOT NULL UNIQUE,
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hp_analytics_hourly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view hourly analytics" ON public.hp_analytics_hourly FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- hp_analytics_traffic
CREATE TABLE public.hp_analytics_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  medium TEXT NOT NULL DEFAULT '',
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, medium)
);
ALTER TABLE public.hp_analytics_traffic ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view traffic analytics" ON public.hp_analytics_traffic FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- record_page_view RPC (anonymous-friendly)
CREATE OR REPLACE FUNCTION public.record_page_view(p_path TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hp_analytics_daily (date, visits, page_views, unique_visitors)
  VALUES (CURRENT_DATE, 1, 1, 1)
  ON CONFLICT (date) DO UPDATE
    SET visits = public.hp_analytics_daily.visits + 1,
        page_views = public.hp_analytics_daily.page_views + 1,
        updated_at = now();

  INSERT INTO public.hp_analytics_pages (page_path, visit_count, views)
  VALUES (p_path, 1, 1)
  ON CONFLICT (page_path) DO UPDATE
    SET visit_count = public.hp_analytics_pages.visit_count + 1,
        views = public.hp_analytics_pages.views + 1,
        updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_page_view(TEXT) TO anon, authenticated;
