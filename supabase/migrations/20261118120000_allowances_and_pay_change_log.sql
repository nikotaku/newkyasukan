-- 設定ダッシュボードの「手当」の表。20260513100000_fix_broken_tables.sql で作るはずだったが本番に無く、手当の画面が動いていなかった。
-- ほかの表と同じく店舗ごと（store_id・set_store_id・store_isolation）にする。
create table if not exists public.allowances (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  allowance_type text not null default 'fixed' check (allowance_type in ('fixed', 'percentage')),
  amount         numeric not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  store_id       uuid not null default '00000000-0000-0000-0000-000000000001' references public.stores(id) on delete cascade
);

alter table public.allowances enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'allowances' and policyname = 'allowances_manage') then
    create policy "allowances_manage" on public.allowances for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'allowances' and policyname = 'store_isolation') then
    create policy "store_isolation" on public.allowances as restrictive for all to authenticated
      using (store_id in (select public.current_store_ids()))
      with check (store_id in (select public.current_store_ids()));
  end if;
end
$$;

revoke all on public.allowances from anon;
grant select, insert, update, delete on public.allowances to authenticated;

create or replace trigger trg_set_store_id before insert on public.allowances
  for each row execute function public.set_store_id();

-- 変更の記録に 控除・手当・広告費 も足す（名前は name 列）
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
    when 'payment_settings' then coalesce(v_row ->> 'payment_method', '')
    else coalesce(v_row ->> 'name', '')
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
  foreach t in array array['deductions', 'allowances', 'referral_rewards'] loop
    execute format('create or replace trigger trg_log_rate_master_change after insert or update or delete on public.%I for each row execute function private.log_rate_master_change()', t);
  end loop;
end
$$;
