
-- O2投稿用テーブル
CREATE TABLE public.cast_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cast_id UUID NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  image_urls TEXT[],
  status TEXT NOT NULL DEFAULT 'pending',
  o2_status TEXT NOT NULL DEFAULT 'pending',
  o2_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cast_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cast posts" ON public.cast_posts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cast posts viewable by everyone" ON public.cast_posts
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert cast posts" ON public.cast_posts
  FOR INSERT WITH CHECK (true);

-- サイトログイン情報テーブル
CREATE TABLE public.cast_site_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cast_id UUID NOT NULL,
  site TEXT NOT NULL,
  login_id TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cast_id, site)
);

ALTER TABLE public.cast_site_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cast site credentials" ON public.cast_site_credentials
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can manage own credentials via token" ON public.cast_site_credentials
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_cast_posts_updated_at BEFORE UPDATE ON public.cast_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cast_site_credentials_updated_at BEFORE UPDATE ON public.cast_site_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
