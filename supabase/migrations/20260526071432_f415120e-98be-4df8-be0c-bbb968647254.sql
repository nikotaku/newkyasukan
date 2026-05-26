
ALTER TABLE public.casts ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;
ALTER TABLE public.therapist_profiles ADD COLUMN IF NOT EXISTS hobbies text;
