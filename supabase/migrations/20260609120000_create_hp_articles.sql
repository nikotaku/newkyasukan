-- HP記事（ニュース・クーポン・出勤情報・新人入店など）テーブル
-- ArticleCreation.tsx の自動投稿・記事管理が参照する

CREATE TABLE IF NOT EXISTS public.hp_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE,
  content text,
  category text DEFAULT 'news',
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hp_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage hp_articles"
  ON public.hp_articles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can read published hp_articles"
  ON public.hp_articles
  FOR SELECT
  TO anon
  USING (is_published = true);

CREATE INDEX IF NOT EXISTS hp_articles_created_at_idx ON public.hp_articles (created_at DESC);
CREATE INDEX IF NOT EXISTS hp_articles_category_idx ON public.hp_articles (category);
