-- シフト提出機能で必要な承認ステータス列を追加
-- submit_therapist_shifts 関数および管理画面(MonthlyShift)が approval_status を参照するが
-- 実テーブルに列が無く、提出時に insert が失敗していた
alter table public.shifts add column if not exists approval_status text not null default 'pending';
