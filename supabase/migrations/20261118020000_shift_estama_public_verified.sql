-- 出勤同期のあと、エステ魂の公開ページでその出勤が表示されているのを確かめた日時。
-- 月別シフトの赤い✓（人の確認 estama_human_confirmed と同じ印）に使う。シフトを直したら消す。
alter table public.shifts
  add column if not exists estama_public_verified_at timestamp with time zone;

comment on column public.shifts.estama_public_verified_at is
  'エステ魂の公開ページで、この出勤が表示されているのを自動で確かめた日時（シフトを直すと消える）';

create or replace function public.set_estama_human_confirmation_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.cast_id is distinct from old.cast_id
    or new.shift_date is distinct from old.shift_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.approval_status is distinct from old.approval_status
    or new.status is distinct from old.status
  ) then
    new.estama_human_confirmed := false;
    new.estama_public_verified_at := null;
  end if;

  if new.estama_human_confirmed then
    if tg_op = 'INSERT'
       or old.estama_human_confirmed is distinct from true
       or new.estama_confirmed_at is null then
      new.estama_confirmed_at := now();
      new.estama_confirmed_by := auth.uid();
    end if;
  else
    new.estama_confirmed_at := null;
    new.estama_confirmed_by := null;
  end if;

  return new;
end;
$$;
