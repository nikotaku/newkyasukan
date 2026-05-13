create table if not exists public.therapist_profiles (
  id                uuid primary key default gen_random_uuid(),
  cast_id           uuid not null references public.casts(id) on delete cascade,
  tags              text[] not null default '{}',
  age               integer,
  height            integer,
  bust              integer,
  waist             integer,
  hip               integer,
  weight            numeric,
  blood_type        text,
  birthplace        text,
  hobbies           text,
  special_skills    text,
  preferred_type    text,
  self_introduction text,
  comment           text,
  mbti              text,
  career_history    text,
  massage_skills    text,
  training_count    integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (cast_id)
);

alter table public.therapist_profiles enable row level security;

-- add tags column if not already present (idempotent)
alter table public.therapist_profiles
  add column if not exists tags text[] not null default '{}';

drop policy if exists "Authenticated read therapist_profiles" on public.therapist_profiles;
drop policy if exists "Authenticated manage therapist_profiles" on public.therapist_profiles;

create policy "Authenticated read therapist_profiles"
  on public.therapist_profiles for select
  to authenticated using (true);

create policy "Authenticated manage therapist_profiles"
  on public.therapist_profiles for all
  to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
