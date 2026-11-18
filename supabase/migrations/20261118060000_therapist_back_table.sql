-- セラピストのマイページの「バック表」：料金・バック表（正本）のコース・オプション・指名をまとめて返す。
-- 本人のトークンで確かめる（辞めた人には返さない）。金額はバックだけで、料金・店落ちは返さない。
create or replace function public.get_therapist_back_table(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('name', b.course_type, 'minutes', b.duration, 'back', b.therapist_back)
        order by b.display_order, b.duration)
      from public.back_rates b where b.store_id = c.store_id), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('name', o.option_name, 'minutes', nullif(o.extension_minutes, 0), 'back', o.therapist_back)
        order by o.display_order, o.option_name)
      from public.option_rates o where o.store_id = c.store_id), '[]'::jsonb),
    'nominations', coalesce((
      select jsonb_agg(jsonb_build_object('name', n.nomination_type, 'back', n.therapist_back)
        order by n.customer_price, n.nomination_type)
      from public.nomination_rates n where n.store_id = c.store_id), '[]'::jsonb)
  )
  from public.casts c
  where c.access_token = p_token and c.is_active = true
  limit 1;
$$;

revoke all on function public.get_therapist_back_table(text) from public;
grant execute on function public.get_therapist_back_table(text) to anon, authenticated;
