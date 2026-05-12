create table if not exists public.therapist_profiles (
  id          uuid primary key default gen_random_uuid(),
  cast_id     uuid not null unique references public.casts(id) on delete cascade,

  -- エステ魂掲載項目
  age         integer,
  height      integer,
  bust        integer,
  waist       integer,
  hip         integer,
  weight      integer,
  birthplace  text,
  blood_type  text check (blood_type in ('A', 'B', 'O', 'AB')),
  hobbies     text,
  special_skills text,
  preferred_type text,
  self_introduction text,
  comment     text,

  -- 内部管理項目
  mbti        text,
  career_history text,
  massage_skills text,
  training_count integer default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.therapist_profiles enable row level security;

create policy "Authenticated users can read therapist_profiles"
  on public.therapist_profiles for select
  to authenticated using (true);

create policy "Authenticated users can insert therapist_profiles"
  on public.therapist_profiles for insert
  to authenticated with check (true);

create policy "Authenticated users can update therapist_profiles"
  on public.therapist_profiles for update
  to authenticated using (true);

create policy "Authenticated users can delete therapist_profiles"
  on public.therapist_profiles for delete
  to authenticated using (true);
