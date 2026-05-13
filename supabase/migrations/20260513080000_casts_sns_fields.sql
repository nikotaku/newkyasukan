alter table public.casts
  add column if not exists line_url    text,
  add column if not exists litlink_url text,
  add column if not exists o2_url      text;

notify pgrst, 'reload schema';
