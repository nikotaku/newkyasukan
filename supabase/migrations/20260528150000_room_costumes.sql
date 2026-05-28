-- ルームごとの衣装DB

CREATE TABLE IF NOT EXISTS public.room_costumes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name       text NOT NULL,
  size       text,
  quantity   integer NOT NULL DEFAULT 1,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_costumes_room ON public.room_costumes(room_id);

ALTER TABLE public.room_costumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_costumes_select" ON public.room_costumes;
CREATE POLICY "room_costumes_select" ON public.room_costumes FOR SELECT USING (true);
DROP POLICY IF EXISTS "room_costumes_admin" ON public.room_costumes;
CREATE POLICY "room_costumes_admin" ON public.room_costumes FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
