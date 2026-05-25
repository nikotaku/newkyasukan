-- 1. Add is_online column to casts (replaces waiting/busy/offline for HP display)
ALTER TABLE public.casts ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

-- 2. Cast messages table (HP visitors can send messages to therapists)
CREATE TABLE IF NOT EXISTS public.cast_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id      uuid NOT NULL REFERENCES public.casts(id) ON DELETE CASCADE,
  sender_name  text NOT NULL,
  message      text NOT NULL,
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cast_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can send a message
CREATE POLICY "cast_messages_insert_anon" ON public.cast_messages
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Authenticated users (admins) can read/update messages
CREATE POLICY "cast_messages_select_auth" ON public.cast_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cast_messages_update_auth" ON public.cast_messages
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "cast_messages_delete_auth" ON public.cast_messages
  FOR DELETE TO authenticated USING (true);
