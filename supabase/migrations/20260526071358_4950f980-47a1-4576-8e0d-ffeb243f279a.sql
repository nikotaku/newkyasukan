
ALTER TABLE public.casts
  ADD COLUMN IF NOT EXISTS o2_url text,
  ADD COLUMN IF NOT EXISTS access_token text;

ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS customer_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_customers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_customers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS therapist_pay numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.reservations
    ADD CONSTRAINT reservations_cast_id_fkey FOREIGN KEY (cast_id) REFERENCES public.casts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.room_supplies
    ADD CONSTRAINT room_supplies_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.therapist_profiles
    ADD CONSTRAINT therapist_profiles_cast_id_fkey FOREIGN KEY (cast_id) REFERENCES public.casts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
