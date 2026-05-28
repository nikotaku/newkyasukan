-- Fix: submit_therapist_shifts のトークン照合を casts.access_token に統一する
-- get_cast_by_access_token / get_therapist_shifts と同じく casts.access_token を使う
-- （cast_access_tokens テーブルを参照していたため、申請が invalid_token で失敗していた）

CREATE OR REPLACE FUNCTION public.submit_therapist_shifts(
  p_token text,
  p_shifts jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cast_id uuid;
  v_item jsonb;
  v_date date;
  v_start time;
  v_end time;
  v_count integer := 0;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  SELECT c.id INTO v_cast_id
  FROM public.casts c
  WHERE c.access_token = p_token
  LIMIT 1;

  IF v_cast_id IS NULL THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF p_shifts IS NULL OR jsonb_typeof(p_shifts) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  -- 再提出を許可（同じ日付の既存シフトを置き換え）
  DELETE FROM public.shifts
  WHERE cast_id = v_cast_id
    AND shift_date IN (
      SELECT (elem->>'shift_date')::date
      FROM jsonb_array_elements(p_shifts) AS elem
    );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shifts)
  LOOP
    v_date := (v_item->>'shift_date')::date;
    v_start := (v_item->>'start_time')::time;
    v_end := (v_item->>'end_time')::time;

    IF v_date IS NULL OR v_start IS NULL OR v_end IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.shifts (cast_id, shift_date, start_time, end_time, status, approval_status, notes)
    VALUES (v_cast_id, v_date, v_start, v_end, 'scheduled', 'pending', v_item->>'notes');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_therapist_shifts(text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
