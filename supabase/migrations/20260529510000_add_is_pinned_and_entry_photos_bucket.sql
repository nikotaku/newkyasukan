-- ナレッジ記事に is_pinned カラムを追加（取得時のソートで使用しているが未作成だった）
ALTER TABLE public.knowledge_articles ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- 入室方法写真用バケット（コードが entry-photos を参照しているが未作成だった）
INSERT INTO storage.buckets (id, name, public) VALUES ('entry-photos', 'entry-photos', true) ON CONFLICT DO NOTHING;

CREATE POLICY "entry-photos public read" ON storage.objects FOR SELECT USING (bucket_id = 'entry-photos');
CREATE POLICY "entry-photos any upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'entry-photos');
CREATE POLICY "entry-photos any delete" ON storage.objects FOR DELETE USING (bucket_id = 'entry-photos');
