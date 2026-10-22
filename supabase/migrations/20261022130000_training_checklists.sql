-- 講習の項目ごとのチェックリスト（受講状況はチェックした数の％で見る）
alter table public.training_modules
  add column if not exists checklist jsonb not null default '[]'::jsonb;

comment on column public.training_modules.checklist is
  '講習のチェック項目 [{ id, label }]。カリキュラム管理で編集する';

-- チェックした項目の id。null = まだチェックリストで記録していない（昔の status だけの記録）
alter table public.cast_training_records
  add column if not exists checked_items jsonb;
