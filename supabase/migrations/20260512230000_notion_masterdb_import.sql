-- 1. Add detailed columns to facility_contracts
ALTER TABLE public.facility_contracts
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS mailbox_code text,
  ADD COLUMN IF NOT EXISTS internet_connection text,
  ADD COLUMN IF NOT EXISTS contract_holder text,
  ADD COLUMN IF NOT EXISTS management_company text,
  ADD COLUMN IF NOT EXISTS renewal_fee integer,
  ADD COLUMN IF NOT EXISTS auto_lock boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resident_manager boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS key_count integer,
  ADD COLUMN IF NOT EXISTS floor_plan text,
  ADD COLUMN IF NOT EXISTS nominal_holder text,
  ADD COLUMN IF NOT EXISTS contract_terms text,
  ADD COLUMN IF NOT EXISTS contract_status text,
  ADD COLUMN IF NOT EXISTS management_url text,
  ADD COLUMN IF NOT EXISTS login_id text,
  ADD COLUMN IF NOT EXISTS login_password text;

-- 2. Add real_name column to casts
ALTER TABLE public.casts
  ADD COLUMN IF NOT EXISTS real_name text;

-- 3. Insert room contracts from Notion マスタDB
INSERT INTO public.facility_contracts
  (contract_type, name, amount, start_date, end_date, payment_method,
   address, mailbox_code, internet_connection, contract_holder, management_company,
   renewal_fee, auto_lock, resident_manager, key_count, floor_plan, nominal_holder,
   contract_status)
VALUES
  ('rental', 'In-Towner二日町', 60600, '2025-01-01', '2026-12-31', 'bank_transfer',
   '〒980-0802 宮城県仙台市青葉区二日町11-15 In-Townrer二日町201',
   '右へ2回2、左は1回8', '契約あり', '佐々木 農', '日本ホーム株式会社',
   11000, false, false, 1, '1K', '佐々木 農', '契約中'),
  ('rental', 'ラジュール仙台', 86000, '2025-06-27', '2027-06-26', 'bank_transfer',
   '〒980-0821 宮城県仙台市青葉区春日町11-12 ラジュール仙台1107号室',
   '右へ2回7、左へA', '備え付け', '林綾香', 'ハウスメイト',
   NULL, true, false, 2, NULL, '林 綾香', '契約中'),
  ('wifi', 'インルームWi-Fi', 5148, NULL, NULL, 'auto_debit',
   NULL, NULL, NULL, NULL, 'かしも',
   NULL, NULL, NULL, NULL, NULL, NULL, '契約中');

-- 4. Insert advertising platform monthly costs
-- Using first of current month as date
INSERT INTO public.advertising_costs (date, platform, cost, impressions, clicks, conversions)
VALUES
  (DATE_TRUNC('month', NOW())::date, 'エステ魂', 26000, 0, 0, 0),
  (DATE_TRUNC('month', NOW())::date, 'キャスカン', 22000, 0, 0, 0)
ON CONFLICT DO NOTHING;

-- 5. Update casts with real names from Notion (stage name → real name mapping)
UPDATE public.casts SET real_name = '上野'       WHERE name = 'なつめ'  AND real_name IS NULL;
UPDATE public.casts SET real_name = 'ゆう'       WHERE name = '大谷'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '横山沙枝'    WHERE name = 'ばんび'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '五十崎 泰代'  WHERE name = 'りん'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '木村'        WHERE name = 'なぎ'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '佐藤'        WHERE name = 'おとは'  AND real_name IS NULL;
UPDATE public.casts SET real_name = 'シンジ'      WHERE name = 'かりん'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '金子七菜'    WHERE name = 'あいね'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '宮原'        WHERE name = 'うみ'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '会沢里奈'    WHERE name = 'まい'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '松下淳未'    WHERE name = 'ひめ'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '佐藤成海'    WHERE name = 'るい'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '松村 有紗'   WHERE name = 'のぞみ'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '立川栞菜'    WHERE name = 'みなみ'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '神田愛理'    WHERE name = 'さゆ'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '佐藤百華'    WHERE name = 'ありす'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '喜多彩華'    WHERE name = 'ひより'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '岡 里美'     WHERE name = 'ゆりあ'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '大木 美涼'   WHERE name = 'まりな'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '細井みほ'    WHERE name = 'もな'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '高橋優巴'    WHERE name = 'らむ'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '棟形 さくら'  WHERE name = 'もも'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '平山世梨香'   WHERE name = 'みづき'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '八木純菜'    WHERE name = 'ちあき'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '酒井綺華'    WHERE name = 'まりの'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '山本瑞季'    WHERE name = 'りんか'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '岡村 渚'     WHERE name = 'みおん'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '阿部樹理亜'   WHERE name = 'かな'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '瀬谷南々美'   WHERE name = 'かえで'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '畑山美咲'    WHERE name = 'しいな'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '實川'        WHERE name = 'まりん'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '佐々木れな'   WHERE name = '未定'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '福田由美'    WHERE name = 'はる'   AND real_name IS NULL;
UPDATE public.casts SET real_name = '石橋 和香奈'  WHERE name = 'しおり'  AND real_name IS NULL;
UPDATE public.casts SET real_name = '高橋菫'      WHERE name = 'かすみ'  AND real_name IS NULL;

NOTIFY pgrst, 'reload schema';
