alter table public.reservations add column if not exists is_off_shift_request boolean not null default false;
