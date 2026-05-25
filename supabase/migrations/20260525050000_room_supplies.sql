-- Room supplies / equipment inventory table
CREATE TABLE IF NOT EXISTS public.room_supplies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    integer NOT NULL DEFAULT 0,
  unit        text NOT NULL DEFAULT '個',
  category    text NOT NULL DEFAULT '備品',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_supplies_select" ON public.room_supplies FOR SELECT TO authenticated USING (true);
CREATE POLICY "room_supplies_insert" ON public.room_supplies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "room_supplies_update" ON public.room_supplies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "room_supplies_delete" ON public.room_supplies FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_room_supplies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_room_supplies_updated_at
  BEFORE UPDATE ON public.room_supplies
  FOR EACH ROW EXECUTE FUNCTION public.update_room_supplies_updated_at();
