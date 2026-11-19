create table public.pr_desk_settings (
 store_id uuid primary key references public.stores(id),
 news boolean not null default false, realtime boolean not null default false,
 attendance boolean not null default false, guest_appeal boolean not null default false,
 job_appeal boolean not null default false, recruiting boolean not null default false,
 job_text text not null default '' check(length(job_text)<=120),
 invites boolean not null default false, invite_text text not null default '' check(length(invite_text)<=500),
 coupon_id uuid references public.discounts(id)
);
create table public.pr_desk_history (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 kind text not null, business_day date not null, slot_key text not null, body text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null, finished_at timestamptz,
 status text not null default 'queued', run_id text, detail jsonb not null default '{}',
 article_id uuid references public.hp_articles(id) on delete set null, notice_id uuid references public.realtime_notices(id),
 unique(store_id,kind,business_day,slot_key)
);
alter table public.pr_desk_settings enable row level security;
alter table public.pr_desk_history enable row level security;
revoke all on public.pr_desk_settings,public.pr_desk_history from public,anon,authenticated;
grant select,insert,update on public.pr_desk_settings to authenticated;
grant select on public.pr_desk_history to authenticated;
create policy manager_settings on public.pr_desk_settings to authenticated using(public.can_manage_store(store_id)) with check(public.can_manage_store(store_id));
create policy manager_history on public.pr_desk_history for select to authenticated using(public.can_manage_store(store_id));
grant all on public.pr_desk_history,public.pr_desk_settings to service_role;
create index pr_desk_queue on public.pr_desk_history(store_id,status,created_at);
alter table public.realtime_notices add column automatic boolean not null default false;

-- Current bookable hour with shift breaks, overnight reservations and preparation time.
create function private.pr_slot(p_store uuid,p_day date,p_now timestamp)
returns table(cast_id uuid,name text,starts timestamp,ends timestamp,available timestamp)
language sql stable set search_path='' as $$
 with shifts as (
 select s.cast_id,c.name,p_day+s.start_time as starts,
 p_day+s.end_time+case when s.end_time<s.start_time then interval '1 day' else interval '0' end as ends,
 p_day+s.break_start+case when s.break_start<s.start_time then interval '1 day' else interval '0' end as pause_start,
 p_day+s.break_end+case when s.break_end<s.start_time or s.break_end<s.break_start then interval '1 day' else interval '0' end as pause_end
 from public.shifts s join public.casts c on c.id=s.cast_id and c.store_id=s.store_id
 where s.store_id=p_store and s.shift_date=p_day and s.status='scheduled' and s.approval_status='approved' and c.is_visible and c.is_active
 ), reservations as (
 select r.cast_id,p_day+r.start_time+case when r.start_time<time '06:00' then interval '1 day' else interval '0' end as begins,
 make_interval(mins=>r.duration+coalesce(r.free_service_minutes,0)+coalesce((select reservation_interval_minutes from public.shop_settings where store_id=p_store limit 1),20)) as blocked
 from public.reservations r where r.store_id=p_store and r.reservation_date=p_day and r.status not in ('cancelled','hold')
 )
 select s.cast_id,s.name,s.starts,s.ends,t.at from shifts s
 cross join lateral (select min(g) as at from generate_series(date_trunc('day',p_now)+ceil(extract(epoch from p_now::time)/600)*interval '10 min',s.ends-interval '60 min',interval '10 min') g
 where g>=s.starts and not coalesce(g<s.pause_end and g+interval '60 min'>s.pause_start,false)
 and not exists(select 1 from reservations r where r.cast_id=s.cast_id and g<r.begins+r.blocked and g+interval '60 min'>r.begins)) t
$$;

create function private.pr_tick(p_store uuid) returns void language plpgsql security definer set search_path='' as $$
declare
 cfg public.pr_desk_settings; local_now timestamp:=now() at time zone 'Asia/Tokyo';
 day date:=(local_now-interval '6 hours')::date; begin_at timestamp; end_at timestamp;
 slot integer; k text; msg text; available_at timestamp; person text; cid uuid; item uuid; nid uuid;
 active_notice public.realtime_notices; expires timestamptz; cp text; profile_text text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_store::text,0));
 select * into cfg from public.pr_desk_settings where store_id=p_store;
 if not found then return; end if;
 update public.pr_desk_history set status='expired',finished_at=now() where store_id=p_store and status='queued' and expires_at<=now();
 update public.pr_desk_history set status='review',finished_at=now() where store_id=p_store and status='running' and created_at<now()-interval '25 min';
 select min(starts), max(ends) into begin_at,end_at from private.pr_slot(p_store,day,local_now);
 select name,available,cast_id into person,available_at,cid from private.pr_slot(p_store,day,local_now) where available is not null order by available,name limit 1;
 select * into active_notice from public.realtime_notices where store_id=p_store and ended_at is null and expires_at>now() order by created_at desc limit 1;
 if person is not null and local_now>=begin_at then
 msg:=person||case when available_at<=local_now+interval '10 min' then '、今すぐご案内可能です。' else '、最短'||to_char(available_at,'HH24:MI')||'からご案内可能です。' end;
 end if;
 if active_notice.automatic and (not cfg.realtime or msg is distinct from active_notice.body) then
 update public.realtime_notices set ended_at=now() where id=active_notice.id;
 active_notice.id:=null;
 end if;
 if cfg.realtime and msg is not null and active_notice.id is null then
 expires:=least(now()+interval '24 hours',end_at at time zone 'Asia/Tokyo');
 insert into public.realtime_notices(store_id,body,expires_at,automatic) values(p_store,msg,expires,true);
 end if;
 if begin_at is null or local_now<begin_at or local_now>=end_at then return; end if;
 slot:=floor(10*extract(epoch from(local_now-begin_at))/extract(epoch from(end_at-begin_at)));
 expires:=(begin_at+(end_at-begin_at)*(slot+1)/10) at time zone 'Asia/Tokyo';
 if cfg.news and msg is not null then
 select d.name into cp from public.discounts d where d.id=cfg.coupon_id and d.store_id=p_store and d.is_active and d.public_booking_enabled and coalesce(d.min_advance_days,0)=0;
 profile_text:=to_char(day,'MM/DD')||'の出勤情報。'||msg||coalesce(' ご利用いただけるクーポン：'||cp||'。条件は予約画面でご確認ください。','');
 if not exists(select 1 from public.pr_desk_history where store_id=p_store and kind='news' and business_day=day and body=profile_text) then
 insert into public.pr_desk_history(store_id,kind,business_day,slot_key,body,expires_at)
 values(p_store,'news',day,slot::text,profile_text,expires) on conflict do nothing returning id into item;
 if item is not null then
 insert into public.hp_articles(store_id,title,slug,content,is_published,category,action_url,post_to_estama,post_to_o2,estama_status,o2_status,news_cast_ids)
 values(p_store,person||' 本日のご案内','pr-'||item,profile_text,true,'schedule','/booking',true,false,'pending','skipped',array[cid]) returning id into nid;
 update public.pr_desk_history set article_id=nid where id=item;
 end if; end if;
 end if;
 foreach k in array array['attendance','guest_appeal','job_appeal','recruiting','invites'] loop
 if not (to_jsonb(cfg)->>k)::boolean then continue; end if;
 if k in ('guest_appeal','job_appeal') and cfg.guest_appeal and cfg.job_appeal and ((slot%2=0)<>(k='guest_appeal')) then continue; end if;
 if k='guest_appeal' and msg is null then continue; end if;
 if k='recruiting' and (trim(cfg.job_text)='' or exists(select 1 from public.pr_desk_history where store_id=p_store and kind=k and business_day=day and body=cfg.job_text and status in ('sent','running','review','queued'))) then continue; end if;
 if k='invites' and (trim(cfg.invite_text)='' or cfg.coupon_id is null) then continue; end if;
 insert into public.pr_desk_history(store_id,kind,business_day,slot_key,body,expires_at)
 values(p_store,k,day,slot::text,case k when 'recruiting' then cfg.job_text when 'invites' then cfg.invite_text when 'attendance' then '出勤情報を保存' when 'guest_appeal' then '集客アピール' else '求人アピール' end,expires) on conflict do nothing;
 end loop;
end $$;

-- HP post and its external delivery record commit together, including manual posts.
create function private.pr_notice_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.pr_desk_history(store_id,kind,business_day,slot_key,body,expires_at,notice_id)
 values(new.store_id,'realtime',((now() at time zone 'Asia/Tokyo')-interval '6 hours')::date,new.id::text,new.body,new.expires_at,new.id);
 update public.realtime_notices set estama_status='queued' where id=new.id;
 return new;
end $$;
create trigger pr_notice_created after insert on public.realtime_notices for each row execute function private.pr_notice_created();
insert into public.pr_desk_settings(store_id) values('404499ab-5350-490f-9608-5814faffda6f');
revoke all on function private.pr_slot(uuid,date,timestamp),private.pr_tick(uuid),private.pr_notice_created() from public,anon,authenticated;

create function public.pr_desk_preview(p_store uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Asia/Tokyo'; d date:=(local_now-interval '6 hours')::date; result jsonb;
begin
 if auth.uid() is null or not coalesce(public.can_manage_store(p_store),false) then raise insufficient_privilege; end if;
 with schedule as(select * from private.pr_slot(p_store,d,local_now)), bounds as(select min(starts) b,max(ends) e from schedule)
 select jsonb_build_object('slots',(select array_agg(to_char(b+(e-b)*i/10,'HH24:MI') order by i) from bounds,generate_series(0,9) i where b is not null),
 'next',(select name||'／'||to_char(available,'HH24:MI')||'〜' from schedule where available is not null order by available,name limit 1)) into result;
 return result;
end $$;
revoke all on function public.pr_desk_preview(uuid) from public,anon;
grant execute on function public.pr_desk_preview(uuid) to authenticated;

create function public.pr_desk_claim(p_store uuid,p_run text) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.pr_desk_history; cfg public.pr_desk_settings; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_store::text,0));
 perform private.pr_tick(p_store);
 select * into cfg from public.pr_desk_settings where store_id=p_store;
 for row in select * from public.pr_desk_history where store_id=p_store and status='queued' order by created_at,id for update loop
 if row.expires_at<=now() or (row.kind<>'realtime' and not coalesce((to_jsonb(cfg)->>row.kind)::boolean,false))
 or (row.kind='realtime' and not exists(select 1 from public.realtime_notices n where n.id=row.notice_id and n.ended_at is null and n.expires_at>now()))
 or (row.kind='news' and not exists(select 1 from private.pr_slot(p_store,row.business_day,now() at time zone 'Asia/Tokyo') s join public.hp_articles a on a.id=row.article_id and s.cast_id=any(a.news_cast_ids) where s.available is not null and a.is_published and a.estama_status='pending'
 and strpos(row.body,case when s.available<=(now() at time zone 'Asia/Tokyo')+interval '10 min' then '今すぐご案内可能' else '最短'||to_char(s.available,'HH24:MI') end)>0))
 then update public.pr_desk_history set status='skipped',finished_at=now() where id=row.id; continue; end if;
 update public.pr_desk_history set status='running',run_id=p_run where id=row.id;
 result:=to_jsonb(row);
 if row.kind='news' then
 update public.hp_articles set estama_status='posting' where id=row.article_id;
 result:=result||jsonb_build_object('article',(select jsonb_build_object('id',a.id,'store_id',a.store_id,'title',a.title,'content',a.content,'image_urls',a.image_urls) from public.hp_articles a where a.id=row.article_id));
 end if;
 return result;
 end loop;
 return null;
end $$;
create function public.pr_desk_finish(p_store uuid,p_run text,p_id uuid,p_status text,p_detail jsonb) returns void language plpgsql security definer set search_path='' as $$
declare row public.pr_desk_history;
begin
 if p_status not in ('sent','review','failed','skipped') then raise exception 'invalid outcome'; end if;
 update public.pr_desk_history set status=p_status,finished_at=now(),detail=p_detail where store_id=p_store and run_id=p_run and id=p_id and status='running' returning * into strict row;
 if row.notice_id is not null then update public.realtime_notices set estama_status=p_status where id=row.notice_id; end if;
 if row.article_id is not null then update public.hp_articles set estama_status=case p_status when 'sent' then 'posted' when 'skipped' then 'skipped' else 'failed' end,
 estama_error=case when p_status in ('review','failed') then coalesce(p_detail->>'message','配信結果を確認してください') end,
 estama_news_url=p_detail->>'url',estama_posted_at=case when p_status='sent' then now() end where id=row.article_id; end if;
end $$;
revoke all on function public.pr_desk_claim(uuid,text),public.pr_desk_finish(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pr_desk_claim(uuid,text),public.pr_desk_finish(uuid,text,uuid,text,jsonb) to service_role;
create function private.pr_desk_cron() returns void language plpgsql security definer set search_path='' as $$
declare s uuid; token text;
begin
 for s in select store_id from public.pr_desk_settings loop
 perform private.pr_tick(s);
 end loop;
 if exists(select 1 from public.pr_desk_history where status='queued' and expires_at>now()) and extract(minute from now())::int%3=0
 and not exists(select 1 from public.automation_runner_runs where purpose='pr' and status='running' and heartbeat_at>now()-interval '3 minutes') then
 select decrypted_secret into token from vault.decrypted_secrets where name='estama_github_actions_dispatch_token';
 if token is not null then perform net.http_post(url:='https://api.github.com/repos/nikotaku/newkyasukan/actions/workflows/estama-direct-runner.yml/dispatches',headers:=jsonb_build_object('Authorization','Bearer '||token,'Accept','application/vnd.github+json'),body:='{"ref":"main","inputs":{"mode":"pr"}}'::jsonb); end if;
 end if;
end $$;
revoke all on function private.pr_desk_cron() from public,anon,authenticated;
select cron.schedule('enka-pr-desk','* * * * *','select private.pr_desk_cron()');
