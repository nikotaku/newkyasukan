-- 1. Fix shifts.status CHECK constraint (add pending/approved used by therapist portal)
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check
  CHECK (status IN ('scheduled', 'pending', 'approved', 'completed', 'cancelled'));

-- 2. Fix rooms to match Notion シフトDB room options
UPDATE public.rooms SET name = 'インルーム' WHERE name = 'インroom';
UPDATE public.rooms SET name = 'ラズルーム' WHERE name = 'ラスroom';
INSERT INTO public.rooms (name, room_type) VALUES ('サンルーム', 'サンルーム')
  ON CONFLICT (name) DO NOTHING;
INSERT INTO public.rooms (name, room_type) VALUES ('インルーム/ラズルーム', 'インルーム')
  ON CONFLICT (name) DO NOTHING;

-- 3. Import shifts from Notion シフトDB
--    Notion ｼﾌﾄﾁｪｯｸ mapping:
--      "ｷｬｽｶﾝ完了/エスたま未登録" / "完了" → 'approved'
--      "未着手" / (no status)            → 'scheduled'
--    Entries without IN/OUT use default hours 12:00–21:00.
--    ON CONFLICT: update room/status if times already exist.
DO $$
DECLARE
  v_cast_id uuid;

  PROCEDURE upsert_shift(
    p_name      text,
    p_date      date,
    p_start     time,
    p_end       time,
    p_room      text,
    p_status    text
  ) AS $$
  DECLARE v uuid;
  BEGIN
    SELECT id INTO v FROM public.casts
    WHERE name = p_name OR name LIKE ('🔰' || p_name || '%') OR name LIKE (p_name || '(%')
    LIMIT 1;
    IF v IS NULL THEN RETURN; END IF;

    INSERT INTO public.shifts (cast_id, shift_date, start_time, end_time, room, status)
    VALUES (v, p_date, p_start, p_end, p_room, p_status)
    ON CONFLICT (cast_id, shift_date, start_time)
    DO UPDATE SET end_time = EXCLUDED.end_time,
                  room     = EXCLUDED.room,
                  status   = EXCLUDED.status;
  END;
  $$;

BEGIN
  -- 2026-05-25
  CALL upsert_shift('えな',   '2026-05-25', '13:00', '22:00', 'ラズルーム', 'approved');
  CALL upsert_shift('はる',   '2026-05-25', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-05-26
  CALL upsert_shift('わかな', '2026-05-26', '11:00', '18:00', NULL,         'approved');
  CALL upsert_shift('はる',   '2026-05-26', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-05-27
  CALL upsert_shift('はる',   '2026-05-27', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-05-28
  CALL upsert_shift('わかな', '2026-05-28', '11:00', '18:00', NULL,         'approved');
  CALL upsert_shift('はる',   '2026-05-28', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-05-29
  CALL upsert_shift('えな',   '2026-05-29', '13:30', '20:00', NULL,         'approved');
  CALL upsert_shift('はる',   '2026-05-29', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-05-30
  CALL upsert_shift('りな',   '2026-05-30', '13:00', '22:00', 'インルーム', 'approved');
  CALL upsert_shift('えな',   '2026-05-30', '13:00', '22:00', 'ラズルーム', 'approved');

  -- 2026-05-31
  CALL upsert_shift('りな',   '2026-05-31', '13:00', '22:00', 'インルーム', 'approved');
  CALL upsert_shift('えな',   '2026-05-31', '13:00', '22:00', 'ラズルーム', 'approved');

  -- 2026-06-02
  CALL upsert_shift('まこ',   '2026-06-02', '12:00', '21:00', 'インルーム', 'scheduled');

  -- 2026-06-03
  CALL upsert_shift('まこ',   '2026-06-03', '12:00', '21:00', 'インルーム', 'scheduled');

  -- 2026-06-04
  CALL upsert_shift('まこ',   '2026-06-04', '12:00', '21:00', 'インルーム', 'scheduled');

  -- 2026-06-05
  CALL upsert_shift('まこ',   '2026-06-05', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert_shift('りか',   '2026-06-05', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-06
  CALL upsert_shift('まこ',   '2026-06-06', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert_shift('りか',   '2026-06-06', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-07
  CALL upsert_shift('まこ',   '2026-06-07', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert_shift('りか',   '2026-06-07', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-11
  CALL upsert_shift('まこ',   '2026-06-11', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-12
  CALL upsert_shift('まこ',   '2026-06-12', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-13
  CALL upsert_shift('まこ',   '2026-06-13', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-14
  CALL upsert_shift('まこ',   '2026-06-14', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-15
  CALL upsert_shift('まこ',   '2026-06-15', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-16
  CALL upsert_shift('まこ',   '2026-06-16', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-17
  CALL upsert_shift('まこ',   '2026-06-17', '12:00', '21:00', 'ラズルーム', 'scheduled');

  -- 2026-06-18
  CALL upsert_shift('まこ',   '2026-06-18', '12:00', '21:00', 'ラズルーム', 'scheduled');

END $$;
