-- ルーム管理の機能拡張: 住所/入室方法/鍵番号 + 設備DB/備品DB

-- 1) 鍵の番号カラムを追加（住所=address, 入室方法=entry_flow は既存）
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS key_number text;

-- 2) 設備DB（各ルームに紐づく設備一覧）
CREATE TABLE IF NOT EXISTS public.room_equipment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   integer NOT NULL DEFAULT 1,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_equipment_room ON public.room_equipment(room_id);

-- 3) 備品DB（消耗品など各ルームに紐づく備品一覧）
CREATE TABLE IF NOT EXISTS public.room_supplies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   integer NOT NULL DEFAULT 0,
  unit       text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_supplies_room ON public.room_supplies(room_id);

-- 4) RLS（閲覧は全員、編集は管理者のみ。roomsテーブルと同方針）
ALTER TABLE public.room_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_supplies  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_equipment_select" ON public.room_equipment;
CREATE POLICY "room_equipment_select" ON public.room_equipment FOR SELECT USING (true);
DROP POLICY IF EXISTS "room_equipment_admin" ON public.room_equipment;
CREATE POLICY "room_equipment_admin" ON public.room_equipment FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "room_supplies_select" ON public.room_supplies;
CREATE POLICY "room_supplies_select" ON public.room_supplies FOR SELECT USING (true);
DROP POLICY IF EXISTS "room_supplies_admin" ON public.room_supplies;
CREATE POLICY "room_supplies_admin" ON public.room_supplies FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
