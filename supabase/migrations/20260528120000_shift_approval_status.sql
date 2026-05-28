-- Shift approval workflow + room assignment
-- セラピストのシフト申請 → 管理者が承認/却下、ルームは管理者が割り当て

-- 1) approval_status カラムを追加（管理者が直接作るシフトは既定で承認済み）
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

-- 既存行は承認済み扱い
UPDATE public.shifts SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status NOT IN ('pending', 'approved', 'rejected');

ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_approval_status_check;
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- 2) セラピストの申請は pending（承認待ち）で登録する
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

  SELECT cast_id INTO v_cast_id
  FROM public.cast_access_tokens
  WHERE access_token = p_token
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

-- 3) セラピスト向け取得RPCに approval_status を追加
CREATE OR REPLACE FUNCTION public.get_therapist_shifts(
  p_token text,
  p_year  int,
  p_month int
)
RETURNS TABLE (
  id              uuid,
  shift_date      date,
  start_time      time,
  end_time        time,
  room            text,
  notes           text,
  approval_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cast_id uuid;
  v_start   date;
  v_end     date;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT c.id INTO v_cast_id
  FROM casts c WHERE c.access_token = p_token;

  IF v_cast_id IS NULL THEN
    RAISE EXCEPTION 'cast not found';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month')::date;

  RETURN QUERY
  SELECT s.id, s.shift_date, s.start_time, s.end_time, s.room, s.notes, s.approval_status
  FROM shifts s
  WHERE s.cast_id = v_cast_id
    AND s.shift_date >= v_start
    AND s.shift_date < v_end
  ORDER BY s.shift_date, s.start_time;
END $$;

GRANT EXECUTE ON FUNCTION public.get_therapist_shifts(text, int, int) TO anon, authenticated;

-- 4) リアルタイム購読（既に追加済みなら無視）
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
