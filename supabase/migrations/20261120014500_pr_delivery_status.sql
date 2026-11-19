create function private.pr_delivery_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.notice_id is not null then
   update public.realtime_notices set estama_status=new.status where id=new.notice_id;
 end if;
 if new.article_id is not null and new.status in ('expired','skipped','review') then
   update public.hp_articles set estama_status=case when new.status='review' then 'failed' else 'skipped' end,
     estama_error=case when new.status='review' then '送信結果の確認が必要です' end
   where id=new.article_id and estama_status in ('pending','posting');
 end if;
 return new;
end $$;
revoke all on function private.pr_delivery_changed() from public,anon,authenticated;
create trigger pr_delivery_changed after update of status on public.pr_desk_history for each row
 when (old.status is distinct from new.status) execute function private.pr_delivery_changed();

-- Stop later slots of the same appeal if a prior click might already have used the allowance.
create function private.pr_hold_uncertain_appeal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind in ('attendance','guest_appeal','job_appeal') and exists (
 select 1 from public.pr_desk_history h where h.store_id=new.store_id and h.kind=new.kind and h.business_day=new.business_day and h.status='review'
 ) then
  new.status:='skipped';
  new.finished_at:=now();
  new.detail:=jsonb_build_object('message','前回のアピールが要確認のため見送り');
 end if;
 return new;
end $$;
revoke all on function private.pr_hold_uncertain_appeal() from public,anon,authenticated;
create trigger pr_hold_uncertain_appeal before insert on public.pr_desk_history for each row execute function private.pr_hold_uncertain_appeal();
