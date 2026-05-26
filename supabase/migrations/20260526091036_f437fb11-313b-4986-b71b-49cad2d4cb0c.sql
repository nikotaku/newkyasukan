CREATE TABLE public.recommended_courses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  image_url text,
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  interval_posts integer NOT NULL DEFAULT 5,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recommended_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recommended courses viewable by everyone"
ON public.recommended_courses FOR SELECT USING (true);

CREATE POLICY "Admins insert recommended courses"
ON public.recommended_courses FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update recommended courses"
ON public.recommended_courses FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete recommended courses"
ON public.recommended_courses FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_recommended_courses_updated_at
BEFORE UPDATE ON public.recommended_courses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();