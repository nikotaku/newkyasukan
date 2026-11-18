-- 料金・割引・決済の正本（/system/rate-master）の変更の記録。
-- コース（back_rates）・オプション（option_rates）・指名（nomination_rates）・割引（discounts）・決済方法（payment_settings）を
-- どの画面から直しても、DBのトリガーで「いつ・誰が・どれを・どう」変えたかを残す。

create table if not exists public.rate_master_changes (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_email text,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  item_label text not null default '',
  -- 変わった項目：{ "項目": { "before": 値, "after": 値 } }（足した・消したときは中身をまるごと）
  changes jsonb not null default '{}'::jsonb
);

create index if not exists idx_rate_master_changes_store_time on public.rate_master_changes (store_id, changed_at desc);

alter table public.rate_master_changes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_master_changes' and policyname = 'rate_master_changes_read') then
    create policy "rate_master_changes_read" on public.rate_master_changes for select to authenticated
      using (store_id in (select public.current_store_ids()));
  end if;
end
$$;

revoke all on public.rate_master_changes from anon;
revoke insert, update, delete on public.rate_master_changes from authenticated;
grant select on public.rate_master_changes to authenticated;

create or replace function private.log_rate_master_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_skip text[] := array['id', 'store_id', 'created_at', 'updated_at', 'shop_back'];
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_label text;
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_row ->> 'store_id' is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any(v_skip);
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  else
    v_changes := v_row - v_skip;
  end if;

  v_label := case tg_table_name
    when 'back_rates' then coalesce(v_row ->> 'course_type', '') || ' ' || coalesce(v_row ->> 'duration', '') || '分'
    when 'option_rates' then coalesce(v_row ->> 'option_name', '')
    when 'nomination_rates' then coalesce(v_row ->> 'nomination_type', '')
    when 'discounts' then coalesce(v_row ->> 'name', '')
    when 'payment_settings' then coalesce(v_row ->> 'payment_method', '')
    else ''
  end;

  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;

  insert into public.rate_master_changes (store_id, changed_by, changed_by_email, table_name, record_id, action, item_label, changes)
  values (
    (v_row ->> 'store_id')::uuid,
    v_uid,
    v_email,
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    lower(tg_op),
    v_label,
    v_changes
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['back_rates', 'option_rates', 'nomination_rates', 'discounts', 'payment_settings'] loop
    execute format('create or replace trigger trg_log_rate_master_change after insert or update or delete on public.%I for each row execute function private.log_rate_master_change()', t);
  end loop;
end
$$;
