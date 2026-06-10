-- 講習マスタ（カリキュラム項目）— 全セラピスト共通
create table if not exists public.training_modules (
  id            uuid primary key default gen_random_uuid(),
  category      text not null default '一般',
  title         text not null,
  description   text,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.training_modules enable row level security;
create policy "training_modules all" on public.training_modules
  for all to authenticated using (true) with check (true);

-- 各セラピストの受講記録
create table if not exists public.cast_training_records (
  id               uuid primary key default gen_random_uuid(),
  cast_id          uuid not null references public.casts(id) on delete cascade,
  module_id        uuid not null references public.training_modules(id) on delete cascade,
  status           text not null default 'not_started', -- not_started | in_progress | completed
  implemented_date date,
  instructor       text,
  score            int,  -- 1〜5 の習熟度
  feedback         text,
  improvement      text,
  updated_at       timestamptz not null default now(),
  unique(cast_id, module_id)
);
alter table public.cast_training_records enable row level security;
create policy "cast_training_records all" on public.cast_training_records
  for all to authenticated using (true) with check (true);

create index if not exists idx_cast_training_records_cast on public.cast_training_records(cast_id);

-- 初期カリキュラム（メンズエステ向け標準項目）
insert into public.training_modules (category, title, description, display_order) values
  ('入店オリエンテーション', '店舗ルール・コンセプト理解', '店舗の理念・コンセプト・各種ルール（出勤・遅刻・身だしなみ）を説明', 10),
  ('入店オリエンテーション', '個人情報・守秘義務', 'お客様・スタッフの個人情報の取り扱いと守秘義務について', 20),
  ('入店オリエンテーション', 'アプリ・ポータルの使い方', 'シフト提出・退勤フォーム・投稿管理などポータル操作の習得', 30),
  ('接客マナー', '出迎え・お見送りの所作', '第一印象を左右する出迎えからお見送りまでの基本動作', 40),
  ('接客マナー', '会話・トーク術', 'お客様をリラックスさせる会話の組み立てと傾聴', 50),
  ('接客マナー', 'クレーム・トラブル対応', '想定されるトラブル時の初期対応とスタッフ連携', 60),
  ('施術技術', 'オイルトリートメント基礎', 'オイルの扱い・基本ストローク・圧のかけ方', 70),
  ('施術技術', 'リンパドレナージュ', 'リンパの流れに沿った施術と効果的な手技', 80),
  ('施術技術', '密着・体重移動テクニック', '体重移動を使った密着施術の基本', 90),
  ('施術技術', 'コース別の流れ（60分/90分/120分）', '各コース時間配分と施術の組み立て', 100),
  ('衛生・安全', '衛生管理・消毒', 'タオル・備品・室内の衛生管理と消毒手順', 110),
  ('衛生・安全', '緊急時の対応', '体調不良・緊急時の対応とスタッフへの連絡フロー', 120),
  ('集客・自己プロデュース', '写メ日記・SNS投稿', '魅力的な写メ日記・SNS投稿の作り方', 130),
  ('集客・自己プロデュース', 'プロフィール作成', '指名につながるプロフィール・自己PRの書き方', 140)
on conflict do nothing;

notify pgrst, 'reload schema';
