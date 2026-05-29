-- 店舗設定テーブル（エステ魂等の外部サイト認証情報などを格納）
-- RLS で service role のみアクセス可（公開不可）
CREATE TABLE IF NOT EXISTS public.shop_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.shop_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.shop_config USING (false);
