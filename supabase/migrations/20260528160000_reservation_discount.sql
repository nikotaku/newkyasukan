-- 予約に割引額カラムを追加（割引マスタから選択して適用した金額を保存）
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
