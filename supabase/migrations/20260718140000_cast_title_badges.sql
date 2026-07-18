-- セラピストの称号バッジ（電撃入店⚡️ など）。
-- マスタを事前登録し、セラピスト管理画面のプルダウンで casts.title_badge_id に紐付ける。
-- style_key はフロント側のバッジデザイン（配色・アニメーション）に対応する。

create table if not exists public.cast_title_badges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001',
  label text not null,
  style_key text not null default 'gold',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cast_title_badges enable row level security;

-- 公開HPが読むため anon にも SELECT を許可。編集はログインユーザー。
create policy "cast_title_badges_public_select" on public.cast_title_badges
  for select to public using (true);
create policy "cast_title_badges_authenticated_all" on public.cast_title_badges
  for all to authenticated using (true) with check (true);

alter table public.casts add column if not exists title_badge_id uuid references public.cast_title_badges(id) on delete set null;

-- 初期バッジ（WEBマーケ観点で興味を惹く定番セット）
insert into public.cast_title_badges (label, style_key, display_order)
select v.label, v.style_key, v.display_order
from (values
  ('電撃入店⚡️',        'lightning', 1),
  ('WEB予約人気⭐️⭐️⭐️', 'star',      2),
  ('完全未経験🔰',       'fresh',     3),
  ('本日デビュー✨',      'debut',     4),
  ('予約殺到🔥',         'fire',      5),
  ('リピート率No.1👑',   'crown',     6),
  ('SNSで話題💎',        'gem',       7),
  ('期間限定在籍⏳',      'limited',   8)
) as v(label, style_key, display_order)
where not exists (select 1 from public.cast_title_badges);
