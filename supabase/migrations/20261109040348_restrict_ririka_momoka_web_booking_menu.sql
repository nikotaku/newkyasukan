create function public.check_ririka_momoka_web_booking_menu()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.booking_origin in ('web_form', 'cast_form')
    and new.cast_id = '3155fd7c-8b35-48ea-a6f8-12d3eb7dd0c2'
    and (
      new.course_type is distinct from 'Wセラピストコース'
      or new.duration is null
      or new.duration not in (60, 80, 100)
      or not (coalesce(new.options, '{}'::text[]) <@ array['オプションパック-双艶-', 'オプションパック-艶結-'])
      or new.nomination_type is distinct from '特別指名料'
    )
  then
    raise check_violation using message = 'りりか・ももかのネット予約はW専用メニューを選択してください。';
  end if;
  return new;
end;
$$;

revoke all on function public.check_ririka_momoka_web_booking_menu()
  from public, anon, authenticated;

-- Run after booking metadata normalization, which classifies anonymous inserts.
create trigger trg_validate_ririka_momoka_web_booking_menu
before insert on public.reservations
for each row execute function public.check_ririka_momoka_web_booking_menu();
