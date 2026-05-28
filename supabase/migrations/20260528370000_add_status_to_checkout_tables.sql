-- 退勤フォームの報告を「確認待ち」管理するためのステータスカラム
ALTER TABLE public.daily_sales_records
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.cleaning_checklists
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.daily_feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
