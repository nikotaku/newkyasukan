alter table public.rooms
  add column if not exists reset_procedure  text,
  add column if not exists cleaning_manual  text;

notify pgrst, 'reload schema';
