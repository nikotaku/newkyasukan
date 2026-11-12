begin;
do $$
declare p public.cast_posts; j uuid; claim jsonb; s uuid:='404499ab-5350-490f-9608-5814faffda6f'; ok boolean;
begin
 select * into p from public.cast_posts where store_id=s limit 1;
 p.id:=gen_random_uuid(); p.esutama_status:='pending';p.esutama_error:=null;p.o2_status:='pending';
 insert into public.cast_posts select p.*;
 update public.automation_runner_settings set diary_enabled=true where store_id=s;
 j:=public.enqueue_estama_direct_diary(p.id);
 if (select status from public.automation_jobs where id=j)<>'queued' then raise exception 'not_queued';end if;
 if public.enqueue_estama_direct_diary(p.id)<>j then raise exception 'duplicate_enqueue';end if;
 insert into public.automation_runner_runs(run_id,store_id,mode) values('transaction-verification',s,'work');
 claim:=public.claim_estama_direct_job(s,'transaction-verification');
 if claim->>'id'<>j::text then raise exception 'claim_mismatch';end if;
 if public.claim_estama_direct_job(s,'transaction-verification') is not null then raise exception 'duplicate_claim';end if;
 if public.finish_estama_direct_job(j,gen_random_uuid(),'transaction-verification','failed','{}','wrong lease') then raise exception 'wrong_lease';end if;
 update public.automation_jobs set submission_started_at=now(),heartbeat_at=now()-interval '5 minutes' where id=j;
 perform private.watch_estama_direct_runner();
 if (select status from public.automation_jobs where id=j)<>'review_required' then raise exception 'watchdog_failure';end if;
 if public.manage_estama_direct_job(s,j,'retry') then raise exception 'unsafe_retry';end if;
 if public.manage_estama_direct_job(s,j,'cancel') then raise exception 'unsafe_cancel';end if;
end $$;
rollback;
