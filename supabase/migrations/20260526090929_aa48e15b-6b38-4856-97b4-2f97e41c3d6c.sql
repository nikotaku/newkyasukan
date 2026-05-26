ALTER TABLE public.cast_posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'cast_message';

UPDATE public.cast_posts SET post_type = 'cast_message' WHERE post_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_cast_posts_post_type ON public.cast_posts(post_type);