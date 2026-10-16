-- エステ魂の仮予約のオプション（「お店への予約」のオプション欄）。予約表に登録するときにオプションを入れるため
alter table public.estama_reservation_requests add column if not exists option_label text;
-- save_estama_reservation_requests は item の optionLabel を option_label に入れる（本番には関数定義を書き換えて適用済み）
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.save_estama_reservation_requests(text,jsonb)'::regprocedure);
  if position('option_label' in v_def) = 0 then
    v_def := replace(v_def, $r$visit_kind, member_label, customer_name, customer_phone, customer_email
    ) values ($r$, $r$visit_kind, member_label, customer_name, customer_phone, customer_email, option_label
    ) values ($r$);
    v_def := replace(v_def, $r$left(v_item ->> 'customerPhone', 20), left(v_item ->> 'customerEmail', 200)
    )$r$, $r$left(v_item ->> 'customerPhone', 20), left(v_item ->> 'customerEmail', 200), left(v_item ->> 'optionLabel', 300)
    )$r$);
    v_def := replace(v_def, $r$do update set last_seen_at = now()$r$, $r$do update set last_seen_at = now(), option_label = coalesce(excluded.option_label, t.option_label)$r$);
    execute v_def;
  end if;
end $$;
