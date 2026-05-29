-- 本指名判定用RPC：顧客の電話番号＋セラピストで過去のキャンセル以外の予約があれば true（本指名）
-- PII を露出させないよう boolean のみ返す SECURITY DEFINER 関数
CREATE OR REPLACE FUNCTION public.check_repeat_nomination(p_phone text, p_cast_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM reservations r
    WHERE r.cast_id = p_cast_id
      AND regexp_replace(coalesce(r.customer_phone, ''), '\D', '', 'g')
          = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
      AND regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
      AND coalesce(r.status, '') <> 'cancelled'
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_repeat_nomination(text, uuid) TO anon, authenticated;
