-- CTI（050番号）着信ログ。Twilio Webhook（Edge Function cti-incoming）が書き込み、
-- 管理画面が Realtime で購読して着信ポップを表示する。

create table if not exists public.cti_calls (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001',
  call_sid text unique,
  from_number text not null,
  to_number text,
  -- ringing / completed(応答) / no-answer / busy / failed
  status text not null default 'ringing',
  duration_seconds integer,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cti_calls_created_at on public.cti_calls (created_at desc);

alter table public.cti_calls enable row level security;

-- 書き込みは Edge Function（service role）のみ。管理画面は閲覧・削除のみ。
create policy "cti_calls_select_authenticated" on public.cti_calls
  for select to authenticated using (true);
create policy "cti_calls_delete_authenticated" on public.cti_calls
  for delete to authenticated using (true);

-- Realtime 配信対象に追加
alter publication supabase_realtime add table public.cti_calls;

-- 着信番号→顧客照合＋ログ記録（Edge Function から1回のRPCで完結させる）
create or replace function public.cti_log_incoming(p_call_sid text, p_from text, p_to text)
returns table(customer_id uuid, customer_name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_cust record;
begin
  if length(norm_phone(p_from)) >= 10 then
    select c.id, c.name into v_cust
    from customers c
    where norm_phone(c.phone) = norm_phone(p_from)
    order by (c.last_visited is null), c.last_visited desc
    limit 1;
  end if;

  insert into cti_calls (call_sid, from_number, to_number, customer_id, customer_name)
  values (p_call_sid, p_from, p_to, v_cust.id, v_cust.name)
  on conflict (call_sid) do nothing;

  return query select v_cust.id, v_cust.name;
end
$$;
