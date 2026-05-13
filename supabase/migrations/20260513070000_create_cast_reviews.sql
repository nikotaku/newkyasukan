create table if not exists public.cast_reviews (
  id            uuid primary key default gen_random_uuid(),
  cast_id       uuid not null references public.casts(id) on delete cascade,
  reviewer_name text not null default '名無し',
  rating        integer not null default 5 check (rating between 1 and 5),
  body          text not null,
  visit_date    date,
  course        text,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.cast_reviews enable row level security;

create policy "Anyone can read visible cast_reviews"
  on public.cast_reviews for select using (is_visible = true);

create policy "Authenticated manage cast_reviews"
  on public.cast_reviews for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
