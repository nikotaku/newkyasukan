-- マイページの精算：直近62日・20件に加えて、まだ払っていない不足分は古くても必ず返す（受け取り方の選び忘れを上に出すため）
create or replace function public.get_therapist_settlements(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with me as (
    select c.id
    from public.casts c
    where p_token is not null
      and length(p_token) between 8 and 200
      and c.access_token = p_token
    limit 1
  ),
  picked as (
    (select a.clearance_id
     from public.settlement_approvals a
     join me on me.id = a.cast_id
     where a.date >= (now() at time zone 'Asia/Tokyo')::date - 62
     order by a.date desc, a.approved_at desc
     limit 20)
    union
    select a.clearance_id
    from public.settlement_approvals a
    join me on me.id = a.cast_id
    where a.shortage_amount > 0 and a.shortage_settled_at is null
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
        join picked on picked.clearance_id = a.clearance_id
        join public.daily_clearances d on d.id = a.clearance_id
      ) s
    ), '[]'::jsonb)
  ) end;
$function$;
