-- 使い方マニュアル画像（複数枚）を設備DBに追加
ALTER TABLE public.facility_equipment
  ADD COLUMN IF NOT EXISTS manual_images text[] NOT NULL DEFAULT '{}';

-- ストレージバケット（公開）
INSERT INTO storage.buckets (id, name, public)
VALUES ('facility-manuals', 'facility-manuals', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "facility_manuals_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'facility-manuals');

CREATE POLICY "facility_manuals_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'facility-manuals' AND auth.role() = 'authenticated');

CREATE POLICY "facility_manuals_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'facility-manuals' AND auth.role() = 'authenticated');

CREATE POLICY "facility_manuals_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'facility-manuals' AND auth.role() = 'authenticated');
