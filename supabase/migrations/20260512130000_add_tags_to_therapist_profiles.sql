alter table public.therapist_profiles add column if not exists tags text[] not null default '{}';
