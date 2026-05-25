-- Posts table
create table if not exists public.cast_posts (
  id          uuid primary key default gen_random_uuid(),
  cast_id     uuid not null references public.casts(id) on delete cascade,
  title       text,
  body        text not null,
  image_urls  text[],
  status      text not null default 'draft', -- draft | pending | posted | failed
  posted_at   timestamptz,
  o2_status   text default 'pending',        -- pending | posted | failed | skipped
  esutama_status text default 'pending',
  o2_error    text,
  esutama_error text,
  created_at  timestamptz default now()
);

-- Credentials table (therapist login info for external sites)
create table if not exists public.cast_site_credentials (
  id          uuid primary key default gen_random_uuid(),
  cast_id     uuid not null references public.casts(id) on delete cascade,
  site        text not null,  -- 'o2' | 'esutama'
  login_id    text not null,
  password    text not null,
  created_at  timestamptz default now(),
  unique(cast_id, site)
);
