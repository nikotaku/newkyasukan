-- キャスカンでセラピストを退店（is_active を false）にしたら、エステ魂のセラピスト一覧でも「非表示」にする。
-- 削除はしない（写真・口コミは残り、戻ってきたら表示に戻せる）。作業は estama_register_cast の payload.action = 'hide'
-- （プロフィール同期と同じワーカーが流す。本体は server/estama-automation.ts の hideEstamaCast）。
create or replace function public.trg_enqueue_estama_cast_hide()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(old.is_active, false) and not coalesce(new.is_active, false)
     and exists (
       select 1 from public.external_cast_profiles profile
       where profile.cast_id = new.id and profile.provider = 'estama' and profile.external_cast_id is not null
     ) then
    perform public.enqueue_estama_job(
      new.store_id, 'estama_register_cast', new.id, null,
      'estama:cast-hide:' || new.id::text,
      jsonb_build_object('source', 'cast_retired', 'action', 'hide')
    );
  end if;
  return new;
end;
$$;

create or replace trigger trg_enqueue_estama_cast_hide
  after update of is_active on public.casts
  for each row execute function public.trg_enqueue_estama_cast_hide();
