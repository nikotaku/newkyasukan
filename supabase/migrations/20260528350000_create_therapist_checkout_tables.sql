-- 退勤フォーム（セラピストマイページ）で使用するテーブル群

-- 売上記録
CREATE TABLE IF NOT EXISTS public.daily_sales_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  cast_id uuid REFERENCES public.casts(id) ON DELETE SET NULL,
  cash_amount integer NOT NULL DEFAULT 0,
  card_amount integer NOT NULL DEFAULT 0,
  paypay_amount integer NOT NULL DEFAULT 0,
  total_amount integer NOT NULL DEFAULT 0,
  customer_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 清掃チェックリスト
CREATE TABLE IF NOT EXISTS public.cleaning_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  cast_id uuid REFERENCES public.casts(id) ON DELETE SET NULL,
  room_cleaned boolean NOT NULL DEFAULT false,
  supplies_stocked boolean NOT NULL DEFAULT false,
  trash_taken_out boolean NOT NULL DEFAULT false,
  equipment_checked boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 日次フィードバック
CREATE TABLE IF NOT EXISTS public.daily_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  cast_id uuid REFERENCES public.casts(id) ON DELETE SET NULL,
  rating integer NOT NULL DEFAULT 5,
  good_points text,
  improvement_points text,
  customer_feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_daily_sales_records ON public.daily_sales_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_cleaning_checklists ON public.cleaning_checklists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_daily_feedback ON public.daily_feedback FOR ALL USING (true) WITH CHECK (true);
