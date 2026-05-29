-- キャスト管理情報に管理用写真（表側に出さない）を追加
ALTER TABLE public.casts ADD COLUMN IF NOT EXISTS management_photos text[] DEFAULT '{}';
