-- 日別精算の承認をマイページで知らせる（清算明細をLINEで送る代わり）。
--  ① セラピストがマイページから精算（売上）を送る → 管理画面アプリにスマホ通知（既存の daily_sales）
--  ② 通知を開くと、その人の清算明細の画像が出る → 「金額を承認」
--  ③ セラピストのマイページに「精算が承認されました」と明細を出す（therapist_notifications の kind = 'settlement'）。
--     現金預かりが給与に足りない（不足分がある）ときは「振込」か「次回出勤日に相殺」を選んでもらい、
--     振込なら振込先（cast_bank_accounts）を入れてもらう
--  ④ 振込を選んだら管理画面アプリに知らせる（daily_sales の通知）。相殺は次の精算に「前回の不足分」として自動で入る
-- daily_clearances は以前からの権限が広いので、明細（お客様名を含む）・不足分・口座はこちらの表に分けて入れる。

-- ── 承認の記録（清算1件に1つ） ─────────────────────────────────────
create table if not exists public.settlement_approvals (
  clearance_id uuid primary key references public.daily_clearances(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  date date not null,
  salary_amount integer not null,
  cash_sales integer not null,
  -- 給与のうち現金預かりで払いきれなかった分（お店があとで払う）
  shortage_amount integer not null default 0,
  shortage_method text check (shortage_method in ('transfer', 'offset')),
  shortage_method_at timestamptz,
  -- 払い終わった（振込済み・次の精算で相殺した）
  shortage_settled_at timestamptz,
  shortage_settled_note text,
  shortage_settled_in uuid references public.daily_clearances(id) on delete set null,
  shortage_settled_by uuid references auth.users(id) on delete set null,
  -- マイページで見せる清算明細（管理画面の明細画像と同じ内容）
  receipt jsonb not null default '{}'::jsonb,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  therapist_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists settlement_approvals_cast_date_idx
  on public.settlement_approvals (cast_id, date desc);
create index if not exists settlement_approvals_outstanding_idx
  on public.settlement_approvals (store_id, date)
  where shortage_amount > 0 and shortage_settled_at is null;

alter table public.settlement_approvals enable row level security;
revoke all on public.settlement_approvals from anon, authenticated;
grant select on public.settlement_approvals to authenticated;
grant all on public.settlement_approvals to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settlement_approvals' and policyname = 'settlement_approvals_managers_read') then
    create policy settlement_approvals_managers_read on public.settlement_approvals
      for select to authenticated
      using ((select public.can_manage_store(store_id)));
  end if;
end;
$$;

-- ── セラピストの振込先（本人がマイページで入れる） ─────────────────────
create table if not exists public.cast_bank_accounts (
  cast_id uuid primary key references public.casts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  bank_name text not null,
  branch_name text not null,
  account_type text not null check (account_type in ('普通', '当座', '貯蓄')),
  account_number text not null check (account_number ~ '^[0-9]{7,8}$'),
  account_holder text not null,
  updated_at timestamptz not null default now()
);
create index if not exists cast_bank_accounts_store_idx on public.cast_bank_accounts (store_id);

alter table public.cast_bank_accounts enable row level security;
revoke all on public.cast_bank_accounts from anon, authenticated;
grant select on public.cast_bank_accounts to authenticated;
grant all on public.cast_bank_accounts to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cast_bank_accounts' and policyname = 'cast_bank_accounts_managers_read') then
    create policy cast_bank_accounts_managers_read on public.cast_bank_accounts
      for select to authenticated
      using ((select public.can_manage_store(store_id)));
  end if;
end;
$$;

-- ── 通知の種類に「精算の承認」を足す ─────────────────────────────────
alter table public.therapist_notifications drop constraint if exists therapist_notifications_kind_check;
alter table public.therapist_notifications
  add constraint therapist_notifications_kind_check check (kind in ('new', 'changed', 'cancelled', 'sns_ready', 'settlement'));

-- ── 管理画面から：金額を承認する（complete_daily_clearance で清算を保存したあとに呼ぶ） ──
create or replace function public.approve_daily_settlement(
  p_cast_id uuid,
  p_date date,
  p_salary integer,
  p_cash_sales integer,
  p_receipt jsonb,
  p_offset_clearance_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid;
  v_clearance uuid;
  v_shortage integer;
  v_was_approved boolean;
  v_offsets uuid[] := coalesce(p_offset_clearance_ids, '{}');
begin
  if auth.uid() is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  select c.store_id into v_store from public.casts c where c.id = p_cast_id;
  if v_store is null or not public.can_manage_store(v_store) then
    raise exception 'このセラピストは操作できません' using errcode = '42501';
  end if;
  if p_date is null or p_salary is null or p_cash_sales is null or p_cash_sales < 0 then
    raise exception '金額が正しくありません' using errcode = '22023';
  end if;

  select d.id into v_clearance
  from public.daily_clearances d
  where d.cast_id = p_cast_id and d.date = p_date and d.store_id = v_store;
  if v_clearance is null then
    raise exception '先に清算を保存してください' using errcode = 'P0002';
  end if;

  v_shortage := greatest(p_salary - p_cash_sales, 0);
  select exists (select 1 from public.settlement_approvals a where a.clearance_id = v_clearance) into v_was_approved;

  insert into public.settlement_approvals as a (
    clearance_id, store_id, cast_id, date, salary_amount, cash_sales, shortage_amount,
    receipt, approved_at, approved_by, therapist_seen_at, updated_at
  ) values (
    v_clearance, v_store, p_cast_id, p_date, p_salary, p_cash_sales, v_shortage,
    coalesce(p_receipt, '{}'::jsonb), now(), auth.uid(), null, now()
  )
  on conflict (clearance_id) do update set
    salary_amount = excluded.salary_amount,
    cash_sales = excluded.cash_sales,
    shortage_amount = excluded.shortage_amount,
    receipt = excluded.receipt,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    therapist_seen_at = null,
    updated_at = now(),
    -- 不足分が無くなったら選んだ方法も消す。金額が変わったら「払い終わった」は戻す
    shortage_method = case when excluded.shortage_amount > 0 then a.shortage_method end,
    shortage_method_at = case when excluded.shortage_amount > 0 then a.shortage_method_at end,
    shortage_settled_at = case when excluded.shortage_amount > 0 and excluded.shortage_amount = a.shortage_amount then a.shortage_settled_at end,
    shortage_settled_note = case when excluded.shortage_amount > 0 and excluded.shortage_amount = a.shortage_amount then a.shortage_settled_note end,
    shortage_settled_in = case when excluded.shortage_amount > 0 and excluded.shortage_amount = a.shortage_amount then a.shortage_settled_in end,
    shortage_settled_by = case when excluded.shortage_amount > 0 and excluded.shortage_amount = a.shortage_amount then a.shortage_settled_by end;

  -- 前回までの不足分を今回の給与に上乗せした（相殺した）分。今回の精算から外したものは戻す
  update public.settlement_approvals a
  set shortage_settled_at = null, shortage_settled_note = null, shortage_settled_in = null, shortage_settled_by = null, updated_at = now()
  where a.shortage_settled_in = v_clearance
    and not (a.clearance_id = any (v_offsets));
  update public.settlement_approvals a
  set shortage_method = coalesce(a.shortage_method, 'offset'),
      shortage_method_at = coalesce(a.shortage_method_at, now()),
      shortage_settled_at = now(),
      shortage_settled_note = to_char(p_date, 'FMMM/FMDD') || 'の精算で相殺',
      shortage_settled_in = v_clearance,
      shortage_settled_by = auth.uid(),
      updated_at = now()
  where a.clearance_id = any (v_offsets)
    and a.cast_id = p_cast_id
    and a.store_id = v_store
    and a.date < p_date
    and a.shortage_amount > 0
    and (a.shortage_settled_at is null or a.shortage_settled_in = v_clearance);

  -- セラピストのマイページへ（承認し直したら、まだ送っていない前の通知は送らない）
  update public.therapist_notifications n
  set status = 'skipped', error_message = '承認し直したので新しい通知を送りました', updated_at = now()
  where n.cast_id = p_cast_id
    and n.kind = 'settlement'
    and n.status = 'queued'
    and n.snapshot->>'clearance_id' = v_clearance::text;
  insert into public.therapist_notifications (store_id, cast_id, reservation_id, kind, source, available_at, snapshot)
  values (
    v_store, p_cast_id, null, 'settlement', 'auto', now(),
    jsonb_build_object(
      'clearance_id', v_clearance,
      'date', p_date,
      'salary', p_salary,
      'cash_sales', p_cash_sales,
      'shortage', v_shortage,
      're_approved', v_was_approved
    )
  );
  perform private.dispatch_therapist_notifications();

  return jsonb_build_object('clearance_id', v_clearance, 'shortage_amount', v_shortage);
end;
$$;
revoke all on function public.approve_daily_settlement(uuid, date, integer, integer, jsonb, uuid[]) from public, anon;
grant execute on function public.approve_daily_settlement(uuid, date, integer, integer, jsonb, uuid[]) to authenticated;

-- 不足分を振り込んだ（取り消すときは p_paid = false）
create or replace function public.mark_settlement_shortage_paid(p_clearance_id uuid, p_paid boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid;
begin
  select a.store_id into v_store from public.settlement_approvals a where a.clearance_id = p_clearance_id;
  if v_store is null or not public.can_manage_store(v_store) then
    raise exception 'この精算は操作できません' using errcode = '42501';
  end if;
  update public.settlement_approvals a
  set shortage_settled_at = case when p_paid then now() end,
      shortage_settled_note = case when p_paid then '振込済み' end,
      shortage_settled_in = null,
      shortage_settled_by = case when p_paid then auth.uid() end,
      updated_at = now()
  where a.clearance_id = p_clearance_id
    and a.shortage_amount > 0;
end;
$$;
revoke all on function public.mark_settlement_shortage_paid(uuid, boolean) from public, anon;
grant execute on function public.mark_settlement_shortage_paid(uuid, boolean) to authenticated;

-- ── マイページから（本人のトークンで） ───────────────────────────────
-- 承認された精算（直近2か月・20件まで）と、登録済みの振込先（口座番号は末尾4桁だけ）
create or replace function public.get_therapist_settlements(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select c.id
    from public.casts c
    where p_token is not null
      and length(p_token) between 8 and 200
      and c.access_token = p_token
    limit 1
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'bank_account', (
      select jsonb_build_object(
        'bank_name', b.bank_name,
        'branch_name', b.branch_name,
        'account_type', b.account_type,
        'account_last4', right(b.account_number, 4),
        'account_holder', b.account_holder,
        'updated_at', b.updated_at
      )
      from public.cast_bank_accounts b
      join me on me.id = b.cast_id
    ),
    'settlements', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.date desc, s.approved_at desc)
      from (
        select a.clearance_id as id, a.date, a.salary_amount, a.cash_sales, a.shortage_amount,
          a.shortage_method, a.shortage_method_at, a.shortage_settled_at, a.shortage_settled_note,
          a.receipt, a.approved_at, a.therapist_seen_at, d.payout_method
        from public.settlement_approvals a
        join me on me.id = a.cast_id
        join public.daily_clearances d on d.id = a.clearance_id
        where a.date >= (now() at time zone 'Asia/Tokyo')::date - 62
        order by a.date desc, a.approved_at desc
        limit 20
      ) s
    ), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.get_therapist_settlements(text) from public;
grant execute on function public.get_therapist_settlements(text) to anon, authenticated;

-- 不足分の受け取り方を選ぶ（払い終わるまでは選び直せる）
create or replace function public.choose_therapist_shortage_method(p_token text, p_clearance_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast uuid;
begin
  select c.id into v_cast from public.casts c
  where p_token is not null and length(p_token) between 8 and 200 and c.access_token = p_token
  limit 1;
  if v_cast is null then
    raise exception 'マイページのURLが正しくありません' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('transfer', 'offset') then
    raise exception '受け取り方を選んでください' using errcode = '22023';
  end if;
  update public.settlement_approvals a
  set shortage_method = p_method,
      shortage_method_at = now(),
      therapist_seen_at = coalesce(a.therapist_seen_at, now()),
      updated_at = now()
  where a.clearance_id = p_clearance_id
    and a.cast_id = v_cast
    and a.shortage_amount > 0
    and a.shortage_settled_at is null;
  if not found then
    raise exception 'この精算の不足分はもうお支払い済みです' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.choose_therapist_shortage_method(text, uuid, text) from public;
grant execute on function public.choose_therapist_shortage_method(text, uuid, text) to anon, authenticated;

-- お知らせを見た
create or replace function public.mark_therapist_settlement_seen(p_token text, p_clearance_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.settlement_approvals a
  set therapist_seen_at = now(), updated_at = now()
  where a.clearance_id = p_clearance_id
    and a.therapist_seen_at is null
    and a.cast_id = (
      select c.id from public.casts c
      where p_token is not null and length(p_token) between 8 and 200 and c.access_token = p_token
      limit 1
    );
$$;
revoke all on function public.mark_therapist_settlement_seen(text, uuid) from public;
grant execute on function public.mark_therapist_settlement_seen(text, uuid) to anon, authenticated;

-- 振込先を保存する（口座番号は7桁にそろえる・名義はカタカナ）
create or replace function public.save_therapist_bank_account(
  p_token text,
  p_bank_name text,
  p_branch_name text,
  p_account_type text,
  p_account_number text,
  p_account_holder text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast public.casts;
  v_bank text := btrim(coalesce(p_bank_name, ''));
  v_branch text := btrim(coalesce(p_branch_name, ''));
  v_type text := btrim(coalesce(p_account_type, ''));
  v_number text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
  v_holder text := btrim(coalesce(p_account_holder, ''));
begin
  select * into v_cast from public.casts c
  where p_token is not null and length(p_token) between 8 and 200 and c.access_token = p_token
  limit 1;
  if v_cast.id is null then
    raise exception 'マイページのURLが正しくありません' using errcode = '42501';
  end if;
  if v_bank = '' or length(v_bank) > 40 then raise exception '銀行名を入力してください' using errcode = '22023'; end if;
  if v_branch = '' or length(v_branch) > 40 then raise exception '支店名を入力してください' using errcode = '22023'; end if;
  if v_type not in ('普通', '当座', '貯蓄') then raise exception '口座の種類を選んでください' using errcode = '22023'; end if;
  if v_number !~ '^[0-9]{1,8}$' then raise exception '口座番号は数字で入力してください' using errcode = '22023'; end if;
  if v_holder = '' or length(v_holder) > 60 or v_holder !~ '^[ァ-ヴー　]+$' then
    raise exception '口座名義はカタカナで入力してください' using errcode = '22023';
  end if;
  if length(v_number) < 7 then v_number := lpad(v_number, 7, '0'); end if;

  insert into public.cast_bank_accounts (cast_id, store_id, bank_name, branch_name, account_type, account_number, account_holder, updated_at)
  values (v_cast.id, v_cast.store_id, v_bank, v_branch, v_type, v_number, v_holder, now())
  on conflict (cast_id) do update set
    store_id = excluded.store_id,
    bank_name = excluded.bank_name,
    branch_name = excluded.branch_name,
    account_type = excluded.account_type,
    account_number = excluded.account_number,
    account_holder = excluded.account_holder,
    updated_at = now();

  return jsonb_build_object(
    'bank_name', v_bank,
    'branch_name', v_branch,
    'account_type', v_type,
    'account_last4', right(v_number, 4),
    'account_holder', v_holder,
    'updated_at', now()
  );
end;
$$;
revoke all on function public.save_therapist_bank_account(text, text, text, text, text, text) from public;
grant execute on function public.save_therapist_bank_account(text, text, text, text, text, text) to anon, authenticated;

-- ── 振込を選んで振込先がそろったら管理画面アプリに知らせる（通知の種類は精算 daily_sales）。
--    振込先がまだ無いときは push-notify が送らず、振込先を保存したときに送る ──
create or replace function public.trg_push_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_event text;
  v_store uuid;
  v_id uuid;
  v_resubmitted boolean := false;
  v_topic text;
begin
  if tg_table_name = 'reservations' then
    if new.booking_origin not in ('web_form', 'cast_form') then return new; end if;
    v_event := 'web_booking';
    v_store := new.store_id;
    v_id := new.id;
  elsif tg_table_name = 'sms_logs' then
    if new.direction is distinct from 'inbound' then return new; end if;
    v_event := 'sms_reply';
    v_store := new.store_id;
    v_id := new.id;
  elsif tg_table_name = 'sms_balance_alerts' then
    v_event := 'sms_balance';
    v_id := new.id;
  elsif tg_table_name = 'daily_sales_records' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'daily_sales';
    v_store := new.store_id;
    v_id := new.id;
    v_resubmitted := tg_op = 'UPDATE';
  elsif tg_table_name = 'settlement_approvals' then
    if new.shortage_method is distinct from 'transfer' or new.shortage_settled_at is not null then return new; end if;
    v_event := 'settlement_transfer';
    v_store := new.store_id;
    v_id := new.clearance_id;
  elsif tg_table_name = 'cast_bank_accounts' then
    -- 振込を選んでから振込先を入れたとき（まだ払っていない一番新しい不足分について知らせる）
    select a.clearance_id, a.store_id into v_id, v_store
    from public.settlement_approvals a
    where a.cast_id = new.cast_id
      and a.shortage_method = 'transfer'
      and a.shortage_settled_at is null
      and a.shortage_amount > 0
    order by a.date desc
    limit 1;
    if v_id is null then return new; end if;
    v_event := 'settlement_transfer';
  else
    return new;
  end if;

  -- 振込の希望は精算の通知（daily_sales）を受け取っている端末へ
  v_topic := case when v_event = 'settlement_transfer' then 'daily_sales' else v_event end;
  if not exists (
    select 1 from public.push_subscriptions s
    where v_topic = any (s.topics) and (v_store is null or s.store_id = v_store)
  ) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltcnh6a2l2d3JrcWJocWZiYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTk3NDUsImV4cCI6MjA5Mzk5NTc0NX0.hptY2q8EirLFQLnNuYBFMkMQ6bNc4oFMt0-z_QDxgVk',
      'x-push-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_internal_secret')
    ),
    body := jsonb_build_object('event', v_event, 'id', v_id, 'resubmitted', v_resubmitted)
  );
  return new;
exception when others then
  raise warning 'push notify skipped: %', sqlerrm;
  return new;
end;
$function$;

create or replace trigger settlement_approvals_push_notify
  after update of shortage_method on public.settlement_approvals
  for each row
  when (new.shortage_method = 'transfer' and old.shortage_method is distinct from new.shortage_method)
  execute function public.trg_push_notify();

create or replace trigger cast_bank_accounts_push_notify
  after insert or update on public.cast_bank_accounts
  for each row
  execute function public.trg_push_notify();
