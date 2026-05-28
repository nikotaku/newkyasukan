CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'referral_rewards' AND policyname = 'allow_all_referral_rewards') THEN
    CREATE POLICY "allow_all_referral_rewards" ON public.referral_rewards FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.casts ADD COLUMN IF NOT EXISTS referral_reward_id uuid REFERENCES public.referral_rewards(id) ON DELETE SET NULL;
