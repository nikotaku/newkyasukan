-- 本指名判定を「完了した来店があるか」に厳格化。
-- 従来はキャンセル以外の予約（未来のWEB予約含む）で true になり、
-- 初来店前なのに本指名と判定されてしまっていた。

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
      AND r.status = 'completed'
  );
$$;
