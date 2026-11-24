-- 契約管理の「新規追加」が contract_type（必須）を入れておらず「作成失敗」になっていた。既定値を付け、種類はタグ（1つ）とそろえる
alter table public.facility_contracts alter column contract_type set default 'その他';
