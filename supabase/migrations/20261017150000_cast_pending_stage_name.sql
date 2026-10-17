-- 源氏名が決まる前に本名だけでセラピストを登録できるようにする。
-- 源氏名が未定の間（name が「源氏名未定」「名称未設定」か空）は、HPに出さず、エステ魂にも登録しない。
-- casts は anon から name が読めるので、本名を name に入れないこと（画面は real_name を表示する）。

create or replace function public.cast_stage_name_pending(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(p_name), '') in ('', '源氏名未定', '名称未設定');
$$;

create or replace function public.trg_casts_pending_stage_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.cast_stage_name_pending(new.name) then
    new.name := '源氏名未定';
    new.is_visible := false;
    new.estama_auto_register := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_casts_pending_stage_name on public.casts;
create trigger trg_casts_pending_stage_name
  before insert or update of name, is_visible, estama_auto_register on public.casts
  for each row execute function public.trg_casts_pending_stage_name();

-- 本名・生年月日・面接メモなどの内部情報は、公開サイト（anon）から読めないようにする。
-- 公開ページ・マイページはこれらの列を読んでいない（必要なものは RPC で返している）。
revoke select (
  real_name,
  birth_date,
  memo,
  interview_sheet_url,
  registration_sheet,
  files,
  line_group_id,
  customer_base_memo,
  management_photos,
  referral_route,
  referral_reward_id,
  recent_dispatch_details
) on public.casts from anon;
