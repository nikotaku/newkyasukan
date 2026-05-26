-- 1. Fix shifts.status CHECK constraint
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check
  CHECK (status IN ('scheduled', 'pending', 'approved', 'completed', 'cancelled'));

-- 2. Fix room names to match Notion
UPDATE public.rooms SET name = 'インルーム' WHERE name = 'インroom';
UPDATE public.rooms SET name = 'ラズルーム' WHERE name = 'ラスroom';
INSERT INTO public.rooms (name, room_type) VALUES ('サンルーム', 'サンルーム')
  ON CONFLICT (name) DO NOTHING;
INSERT INTO public.rooms (name, room_type) VALUES ('インルーム/ラズルーム', 'インルーム')
  ON CONFLICT (name) DO NOTHING;

-- 3. Import shifts from Notion
DO $$
DECLARE
  v uuid;

  PROCEDURE upsert(p_name text, p_date date, p_start time, p_end time, p_room text, p_status text)
  LANGUAGE plpgsql AS $p$
  DECLARE vid uuid;
  BEGIN
    SELECT id INTO vid FROM public.casts
    WHERE name = p_name OR name LIKE ('🔰' || p_name || '%') OR name LIKE (p_name || '(%')
    LIMIT 1;
    IF vid IS NULL THEN RETURN; END IF;
    INSERT INTO public.shifts (cast_id, shift_date, start_time, end_time, room, status)
    VALUES (vid, p_date, p_start, p_end, p_room, p_status)
    ON CONFLICT (cast_id, shift_date, start_time)
    DO UPDATE SET end_time = EXCLUDED.end_time, room = EXCLUDED.room, status = EXCLUDED.status;
  END;
  $p$;

BEGIN
  CALL upsert('えな',   '2026-05-25', '13:00', '22:00', 'ラズルーム', 'approved');
  CALL upsert('はる',   '2026-05-25', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('わかな', '2026-05-26', '11:00', '18:00', NULL,         'approved');
  CALL upsert('はる',   '2026-05-26', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('はる',   '2026-05-27', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('わかな', '2026-05-28', '11:00', '18:00', NULL,         'approved');
  CALL upsert('はる',   '2026-05-28', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('えな',   '2026-05-29', '13:30', '20:00', NULL,         'approved');
  CALL upsert('はる',   '2026-05-29', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('りな',   '2026-05-30', '13:00', '22:00', 'インルーム', 'approved');
  CALL upsert('えな',   '2026-05-30', '13:00', '22:00', 'ラズルーム', 'approved');
  CALL upsert('りな',   '2026-05-31', '13:00', '22:00', 'インルーム', 'approved');
  CALL upsert('えな',   '2026-05-31', '13:00', '22:00', 'ラズルーム', 'approved');
  CALL upsert('まこ',   '2026-06-02', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-03', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-04', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-05', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert('りか',   '2026-06-05', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-06', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert('りか',   '2026-06-06', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-07', '12:00', '21:00', 'インルーム', 'scheduled');
  CALL upsert('りか',   '2026-06-07', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-11', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-12', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-13', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-14', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-15', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-16', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-17', '12:00', '21:00', 'ラズルーム', 'scheduled');
  CALL upsert('まこ',   '2026-06-18', '12:00', '21:00', 'ラズルーム', 'scheduled');
END $$;
