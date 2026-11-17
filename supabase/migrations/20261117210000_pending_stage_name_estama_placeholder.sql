-- 源氏名が決まる前のセラピストも、エステ魂には「新人A」などの仮の名前で登録してIDで紐付ける
-- （仮の名前はワーカー側の registerCast が決める。源氏名が決まったら、そのIDの編集画面で名前を直す）。
-- HPには今まで通り出さない（is_visible = false）。エステ魂の自動登録をオフにするのはやめる。
create or replace function public.trg_casts_pending_stage_name()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if public.cast_stage_name_pending(new.name) then
    new.name := '源氏名未定';
    new.is_visible := false;
  end if;
  return new;
end;
$$;
