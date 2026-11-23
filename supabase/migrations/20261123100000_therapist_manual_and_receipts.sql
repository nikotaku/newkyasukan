-- ① 入室後のマニュアル（セラピストのマイページ「入室後のマニュアル」）
--   お店が項目ごとに タイトル・説明・動画（または写真）を登録し、マイページで本人が見る。ルームを決めた項目はそのルームの見出しに出す。
--   動画・写真は entry-photos バケット（公開URL、アップロードはログイン中のスタッフ）の manual/<store_id>/。
-- ② 交通費の領収書：交通費申請に領収書の写真を付ける。写真は非公開バケット transport-receipts（<store_id>/<cast_id>/…）。
--   マイページからのアップロードは Edge Function therapist-receipts（本人のトークンで確認）。お店は管理画面で見て承認する。

create table if not exists public.therapist_manual_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  body text check (body is null or char_length(body) <= 2000),
  video_url text,
  image_url text,
  room_name text,
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists therapist_manual_items_store_idx on public.therapist_manual_items (store_id, display_order);
alter table public.therapist_manual_items enable row level security;
revoke all on public.therapist_manual_items from anon;
grant select, insert, update, delete on public.therapist_manual_items to authenticated;
create policy therapist_manual_items_store on public.therapist_manual_items for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

create or replace function public.get_therapist_manual(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'title', m.title, 'body', m.body, 'video_url', m.video_url,
    'image_url', m.image_url, 'room_name', m.room_name
  ) order by m.display_order, m.created_at), '[]'::jsonb)
  from public.casts c
  join public.therapist_manual_items m on m.store_id = c.store_id and m.is_published
  where c.access_token = p_token and coalesce(p_token, '') <> '' and c.is_active
$$;
revoke all on function public.get_therapist_manual(text) from public;
grant execute on function public.get_therapist_manual(text) to anon, authenticated;

-- 艶華のはじめの3項目（動画はお店が管理画面で入れる）
insert into public.therapist_manual_items (store_id, title, body, display_order)
select '404499ab-5350-490f-9608-5814faffda6f', t.title, t.body, t.ord
from (values
  ('お客様の入室・退室をLINEで報告', 'お客様がお部屋に入ったとき・お帰りになったときに、お店のLINEへ「入室しました」「退室しました」と報告してください。', 10),
  ('備品の置き場', 'タオル・オイル・ペーパーショーツなどの備品の置き場所です。足りないときはお店に連絡してください。', 20),
  ('交通費の領収書のアップロード', '交通費はマイページの「交通費申請」から、金額と一緒に領収書の写真を撮って送ってください。領収書が無い申請は承認できません。', 30)
) as t(title, body, ord)
where exists (select 1 from public.stores where id = '404499ab-5350-490f-9608-5814faffda6f')
  and not exists (select 1 from public.therapist_manual_items where store_id = '404499ab-5350-490f-9608-5814faffda6f');

-- ② 交通費の領収書
alter table public.therapist_transport_expenses add column if not exists receipt_path text;
alter table public.therapist_transport_expenses add column if not exists reviewed_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transport-receipts', 'transport-receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- お店（ログイン中のスタッフ）は自分の店舗の領収書を見られる。アップロードは Edge Function（service_role）だけ
create policy transport_receipts_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'transport-receipts' and (storage.foldername(name))[1] in (select public.current_store_ids()::text));

-- マイページの申請履歴（領収書の有無つき）。以前の get_therapist_transport_expenses は戻りの形を変えずに残す
create or replace function public.get_therapist_transport_expenses_v2(p_token text, p_year integer, p_month integer)
returns table(id uuid, expense_date text, amount integer, route text, notes text, status text, has_receipt boolean)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare v_cast_id uuid;
begin
  select cast_id into v_cast_id from cast_access_tokens where access_token = p_token;
  if v_cast_id is null then raise exception 'invalid token'; end if;
  return query
  select e.id, e.expense_date::text, e.amount, e.route, e.notes, e.status, e.receipt_path is not null
  from therapist_transport_expenses e
  where e.cast_id = v_cast_id
    and extract(year from e.expense_date) = p_year
    and extract(month from e.expense_date) = p_month
  order by e.expense_date desc, e.created_at desc;
end;
$$;
revoke all on function public.get_therapist_transport_expenses_v2(text, integer, integer) from public;
grant execute on function public.get_therapist_transport_expenses_v2(text, integer, integer) to anon, authenticated;
