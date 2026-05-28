-- 並べ替え用の display_order カラムを追加
ALTER TABLE back_rates ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE option_rates ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- 既存データに順序を採番
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY course_type, duration) - 1 AS rn
  FROM back_rates
)
UPDATE back_rates b SET display_order = o.rn FROM ordered o WHERE b.id = o.id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn
  FROM option_rates
)
UPDATE option_rates op SET display_order = o.rn FROM ordered o WHERE op.id = o.id;

-- 公開料金ページのコース取得も display_order 順に
CREATE OR REPLACE FUNCTION public.get_public_back_rates()
 RETURNS TABLE(id uuid, course_type text, duration integer, customer_price integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, course_type, duration, customer_price
  FROM public.back_rates
  ORDER BY display_order ASC, duration ASC;
$function$;
