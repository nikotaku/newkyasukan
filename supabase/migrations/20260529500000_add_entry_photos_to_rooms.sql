-- 入室方法写真カラムを rooms テーブルに追加
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS entry_photos text[] DEFAULT '{}';
