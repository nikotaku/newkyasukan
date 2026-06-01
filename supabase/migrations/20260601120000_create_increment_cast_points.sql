-- セラピストの累積ポイントを加算する RPC（日別清算で使用）
CREATE OR REPLACE FUNCTION public.increment_cast_points(p_cast_id uuid, p_points numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.casts
  SET total_points = COALESCE(total_points, 0) + p_points
  WHERE id = p_cast_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_cast_points(uuid, numeric) TO anon, authenticated, service_role;
