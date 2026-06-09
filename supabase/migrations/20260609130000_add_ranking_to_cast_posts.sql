ALTER TABLE public.cast_posts
  ADD COLUMN IF NOT EXISTS ranking_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ranking_error  text;

COMMENT ON COLUMN public.cast_posts.ranking_status IS 'pending | posted | failed | skipped';
