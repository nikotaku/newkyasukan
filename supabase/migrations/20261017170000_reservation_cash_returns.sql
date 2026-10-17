-- お客様へのキャッシュバック・セラピストの財布からの返金を、起きた予約に記録する。
-- 日別精算に「返金・キャッシュバック」の行として自動で入り、セラピストに返す（お店の負担・売上から引く）。
-- セラピストの取り分（バック）は返金前の料金のまま。daily_clearances には列を足さず other_expenses の kind = cash_return で持つ。

create table if not exists public.reservation_cash_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  cast_id uuid references public.casts(id) on delete set null,
  kind text not null check (kind in ('cashback', 'refund')),
  amount integer not null check (amount > 0 and amount <= 1000000),
  reason text not null default 'その他',
  note text,
  source text not null default 'staff' check (source in ('staff', 'therapist')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  -- 取り消し（行は消さずに残す）
  cancelled_at timestamptz
);

create index if not exists reservation_cash_returns_reservation_idx on public.reservation_cash_returns (reservation_id);
create index if not exists reservation_cash_returns_cast_idx on public.reservation_cash_returns (store_id, cast_id, created_at desc);

alter table public.reservation_cash_returns enable row level security;

drop policy if exists reservation_cash_returns_staff on public.reservation_cash_returns;
create policy reservation_cash_returns_staff on public.reservation_cash_returns
  for all to authenticated
  using (store_id in (select public.current_store_ids()))
  with check (store_id in (select public.current_store_ids()));

revoke all on public.reservation_cash_returns from anon;
grant select, insert, update, delete on public.reservation_cash_returns to authenticated;

-- 予約の店舗・担当をそろえる（スタッフ画面からは reservation_id・金額・理由だけ送る）
create or replace function public.trg_reservation_cash_returns_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid;
  v_cast uuid;
begin
  select r.store_id, r.cast_id into v_store, v_cast
  from public.reservations r where r.id = new.reservation_id;
  if v_store is null then
    raise exception 'reservation not found';
  end if;
  new.store_id := v_store;
  new.cast_id := coalesce(new.cast_id, v_cast);
  return new;
end;
$$;

drop trigger if exists trg_reservation_cash_returns_fill on public.reservation_cash_returns;
create trigger trg_reservation_cash_returns_fill
  before insert or update of reservation_id on public.reservation_cash_returns
  for each row execute function public.trg_reservation_cash_returns_fill();

-- マイページ（本人のトークン）：その日の自分の予約の記録を読む
create or replace function public.get_therapist_cash_returns(p_token text, p_reservation_ids uuid[])
returns table (
  id uuid,
  reservation_id uuid,
  kind text,
  amount integer,
  reason text,
  note text,
  source text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.reservation_id, x.kind, x.amount, x.reason, x.note, x.source, x.created_at
  from public.reservation_cash_returns x
  join public.reservations r on r.id = x.reservation_id
  join public.casts c on c.id = r.cast_id
  where p_token is not null
    and length(p_token) between 8 and 200
    and c.access_token = p_token
    and x.cancelled_at is null
    and x.reservation_id = any(coalesce(p_reservation_ids, '{}'::uuid[]))
  order by x.created_at;
$$;

-- マイページ（本人のトークン）：お客様に返したお金を申告する
create or replace function public.save_therapist_cash_return(
  p_token text,
  p_reservation_id uuid,
  p_kind text,
  p_amount integer,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast uuid;
  v_id uuid;
begin
  if p_token is null or length(p_token) not between 8 and 200 then
    raise exception 'invalid token';
  end if;
  select c.id into v_cast from public.casts c where c.access_token = p_token and c.is_active limit 1;
  if v_cast is null then
    raise exception 'invalid token';
  end if;
  if not exists (select 1 from public.reservations r where r.id = p_reservation_id and r.cast_id = v_cast) then
    raise exception 'reservation not found';
  end if;
  if p_kind not in ('cashback', 'refund') then
    raise exception 'invalid kind';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'invalid amount';
  end if;

  insert into public.reservation_cash_returns (store_id, reservation_id, cast_id, kind, amount, reason, note, source, created_by)
  select r.store_id, r.id, v_cast, p_kind, p_amount,
         coalesce(nullif(btrim(p_reason), ''), 'その他'), nullif(btrim(coalesce(p_note, '')), ''), 'therapist', null
  from public.reservations r where r.id = p_reservation_id
  returning id into v_id;
  return v_id;
end;
$$;

-- マイページ（本人のトークン）：自分で申告したものだけ取り消せる。精算が済んだ日のものは取り消せない
create or replace function public.cancel_therapist_cash_return(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cast uuid;
begin
  select c.id into v_cast from public.casts c
  where p_token is not null and length(p_token) between 8 and 200 and c.access_token = p_token and c.is_active limit 1;
  if v_cast is null then
    raise exception 'invalid token';
  end if;
  update public.reservation_cash_returns x set cancelled_at = now()
  where x.id = p_id and x.cast_id = v_cast and x.source = 'therapist' and x.cancelled_at is null
    and not exists (
      select 1 from public.daily_clearances d
      where d.cast_id = v_cast and d.status = 'completed'
        and d.other_expenses @> jsonb_build_array(jsonb_build_object('source_return_id', p_id::text)));
  return found;
end;
$$;

revoke all on function public.get_therapist_cash_returns(text, uuid[]) from public;
revoke all on function public.save_therapist_cash_return(text, uuid, text, integer, text, text) from public;
revoke all on function public.cancel_therapist_cash_return(text, uuid) from public;
grant execute on function public.get_therapist_cash_returns(text, uuid[]) to anon, authenticated;
grant execute on function public.save_therapist_cash_return(text, uuid, text, integer, text, text) to anon, authenticated;
grant execute on function public.cancel_therapist_cash_return(text, uuid) to anon, authenticated;
