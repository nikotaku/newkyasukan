-- 日別精算の「給与に上乗せする行」を 追加支給（salary_addition）と 給与不足分の相殺（shortage_offset）に分ける。
--   相殺は、前回までに現金が足りず払えなかった給与を今回の現金で払った分。不足が出た日の給与にすでに入っているので、
--   月別清算の給与合計（経費）・純利益には入れない（今まで追加支給と同じに数えていて、二重に引いていた）。
--   other_expenses（jsonb）の kind だけ直す。daily_clearances に列は足さない。
-- これまでの入力：項目名に「不足分」が入っている行と、前回の精算を指している行（source_clearance_id）を相殺にする。
update public.daily_clearances dc
set other_expenses = (
  select jsonb_agg(case when e->>'kind' = 'salary_addition' and (e->>'label' like '%不足分%' or e ? 'source_clearance_id')
    then jsonb_set(e, '{kind}', '"shortage_offset"') else e end order by ord)
  from jsonb_array_elements(dc.other_expenses) with ordinality as x(e, ord))
where jsonb_typeof(dc.other_expenses) = 'array'
  and exists (select 1 from jsonb_array_elements(dc.other_expenses) e
              where e->>'kind' = 'salary_addition' and (e->>'label' like '%不足分%' or e ? 'source_clearance_id'));
