-- Fix: use casts.access_token directly instead of cast_access_tokens join
CREATE OR REPLACE FUNCTION public.get_cast_by_access_token(p_token text)
RETURNS TABLE (
  id uuid,
  name text,
  photo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.photo
  FROM public.casts c
  WHERE c.access_token = p_token
  LIMIT 1;
$$;
