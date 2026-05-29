-- キャスト管理情報にプロフィールフォーマット（複数行テキスト）を追加
ALTER TABLE public.casts ADD COLUMN IF NOT EXISTS profile_format text;
