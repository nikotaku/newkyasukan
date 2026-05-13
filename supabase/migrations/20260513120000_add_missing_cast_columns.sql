-- Add profile columns to casts table that the frontend selects
alter table public.casts
  add column if not exists age       integer,
  add column if not exists height    integer,
  add column if not exists cup_size  text,
  add column if not exists message   text,
  add column if not exists tags      text[] not null default '{}';

notify pgrst, 'reload schema';
