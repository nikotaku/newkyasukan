
-- facility_contracts
CREATE TABLE public.facility_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  amount INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  payment_method TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  address TEXT DEFAULT '',
  mailbox_code TEXT DEFAULT '',
  internet_connection TEXT DEFAULT '',
  contract_holder TEXT DEFAULT '',
  management_company TEXT DEFAULT '',
  renewal_fee INTEGER DEFAULT 0,
  auto_lock BOOLEAN NOT NULL DEFAULT false,
  resident_manager BOOLEAN NOT NULL DEFAULT false,
  key_count INTEGER DEFAULT 0,
  floor_plan TEXT DEFAULT '',
  nominal_holder TEXT DEFAULT '',
  contract_terms TEXT DEFAULT '',
  contract_status TEXT DEFAULT '',
  management_url TEXT DEFAULT '',
  login_id TEXT DEFAULT '',
  login_password TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.facility_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contracts" ON public.facility_contracts FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_fc_updated_at BEFORE UPDATE ON public.facility_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- facility_equipment
CREATE TABLE public.facility_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '個',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.facility_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage equipment" ON public.facility_equipment FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_fe_updated_at BEFORE UPDATE ON public.facility_equipment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- room_supplies
CREATE TABLE public.room_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '個',
  category TEXT NOT NULL DEFAULT '備品',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.room_supplies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage room supplies" ON public.room_supplies FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_rs_updated_at BEFORE UPDATE ON public.room_supplies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- hp_bulletin
CREATE TABLE public.hp_bulletin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hp_bulletin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public view published bulletin" ON public.hp_bulletin FOR SELECT TO public
  USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert bulletin" ON public.hp_bulletin FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update bulletin" ON public.hp_bulletin FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete bulletin" ON public.hp_bulletin FOR DELETE TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_hpb_updated_at BEFORE UPDATE ON public.hp_bulletin
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- rooms: extra columns
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS floor TEXT,
  ADD COLUMN IF NOT EXISTS entry_flow TEXT,
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS key_info TEXT;

-- casts: is_active passthrough column
ALTER TABLE public.casts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- cast_posts: additional columns + FK to casts
ALTER TABLE public.cast_posts
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS esutama_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS esutama_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cast_posts_cast_id_fkey'
  ) THEN
    ALTER TABLE public.cast_posts
      ADD CONSTRAINT cast_posts_cast_id_fkey
      FOREIGN KEY (cast_id) REFERENCES public.casts(id) ON DELETE CASCADE;
  END IF;
END $$;
