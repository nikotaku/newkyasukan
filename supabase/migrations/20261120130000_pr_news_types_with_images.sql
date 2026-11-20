-- AI広報部のニュース自動配信を、エステ魂の「AI広報部」と同じ4種類・画像付きにする。
--   本日の出勤（news_attendance）… 出勤中のセラピストを1人ずつ（その日1回）。他の種類より先
--   今すぐご案内（news）           … 今までの「◯◯、最短HH:MMからご案内可能です」
--   セラピスト紹介（news_intro）   … 在籍のセラピストを、紹介してから長い順に1人ずつ
--   クーポン紹介（news_coupon）    … 画像を登録したクーポンを、その日1回ずつ
-- 画像：セラピストの記事はそのセラピストのパネル写真（HPの1枚目 casts.photos[1]、無ければ casts.photo）。
-- クーポンは AI広報部の画面で登録した画像（pr_desk_settings.news_images の "coupon:<割引ID>"）。
-- ニュースは1つの時間帯（営業時間を10に分けた枠）に1本まで（エステ魂のニュースは1日10回まで）。
-- 今すぐご案内・紹介・クーポンは、時間帯ごとに順番を回して偏らないようにする。

alter table public.pr_desk_settings
  add column if not exists news_attendance boolean not null default false,
  add column if not exists news_intro boolean not null default false,
  add column if not exists news_coupon boolean not null default false,
  add column if not exists news_images jsonb not null default '{}'::jsonb;

-- セラピストのパネル写真（HPの1枚目）
create or replace function private.pr_cast_photo(p_cast uuid)
returns text language sql stable set search_path='' as $$
  select coalesce(nullif(c.photos[1], ''), nullif(c.photo, ''))
  from public.casts c where c.id = p_cast
$$;

-- 営業日の時刻（深夜は24時・25時）
create or replace function private.pr_hhmm(p_day date, p_at timestamp)
returns text language sql immutable set search_path='' as $$
  select floor(extract(epoch from (p_at - p_day::timestamp)) / 3600)::int::text
    || ':' || lpad(extract(minute from p_at)::int::text, 2, '0')
$$;

-- ニュース1本（配信の記録 → HPの記事）。同じ種類・同じ時間帯に2本は作らない
create or replace function private.pr_post_news(
  p_store uuid, p_kind text, p_day date, p_slot integer, p_expires timestamptz,
  p_title text, p_body text, p_image text, p_cast uuid, p_category text
) returns uuid language plpgsql security definer set search_path='' as $$
declare item uuid; nid uuid;
begin
  insert into public.pr_desk_history(store_id, kind, business_day, slot_key, body, expires_at)
  values (p_store, p_kind, p_day, p_slot::text, p_body, p_expires)
  on conflict do nothing returning id into item;
  if item is null then return null; end if;
  insert into public.hp_articles(store_id, title, slug, content, is_published, category, action_url,
    post_to_estama, post_to_o2, estama_status, o2_status, news_cast_ids, image_urls)
  values (p_store, left(p_title, 30), 'pr-' || item, p_body, true, p_category, '/booking',
    true, false, 'pending', 'skipped',
    case when p_cast is null then '{}'::uuid[] else array[p_cast] end,
    case when p_image is null then '{}'::text[] else array[p_image] end)
  returning id into nid;
  update public.pr_desk_history set article_id = nid where id = item;
  return item;
end $$;

create or replace function private.pr_tick(p_store uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare
 cfg public.pr_desk_settings; local_now timestamp:=now() at time zone 'Asia/Tokyo';
 day date:=(local_now-interval '6 hours')::date; begin_at timestamp; end_at timestamp;
 slot integer; k text; msg text; available_at timestamp; person text; cid uuid; item uuid;
 active_notice public.realtime_notices; expires timestamptz; cp text; profile_text text;
 news_done boolean:=false; kinds text[]:=array[]::text[]; n integer; i integer; r record;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_store::text,0));
 select * into cfg from public.pr_desk_settings where store_id=p_store;
 if not found then return; end if;
 update public.pr_desk_history set status='expired',finished_at=now() where store_id=p_store and status='queued' and expires_at<=now();
 update public.pr_desk_history set status='review',finished_at=now() where store_id=p_store and status='running' and coalesce(claimed_at,created_at)<now()-interval '25 min';
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

 -- ニュースは1つの時間帯に1本まで
 news_done:=exists(select 1 from public.pr_desk_history where store_id=p_store and business_day=day and slot_key=slot::text
   and kind in ('news','news_attendance','news_intro','news_coupon'));

 -- 本日の出勤（他の種類より先）：出勤中で、今日まだ出していない人。空きのある人から
 if not news_done and cfg.news_attendance then
  select s.cast_id, s.name, s.starts, s.ends, s.available, private.pr_cast_photo(s.cast_id) as photo,
    nullif(trim(coalesce(c.banner_copy,'')),'') as copy
  into r
  from private.pr_slot(p_store,day,local_now) s join public.casts c on c.id=s.cast_id
  where s.starts<=local_now and s.ends>local_now and private.pr_cast_photo(s.cast_id) is not null
    and not exists(select 1 from public.pr_desk_history h join public.hp_articles a on a.id=h.article_id
      where h.store_id=p_store and h.kind='news_attendance' and h.business_day=day and s.cast_id=any(a.news_cast_ids))
  order by s.available is null, s.starts, s.name limit 1;
  if found then
   profile_text:=to_char(day,'MM/DD')||' 本日の出勤情報です。'||chr(10)||r.name||'　'||private.pr_hhmm(day,r.starts)||'〜'||private.pr_hhmm(day,r.ends)
     ||coalesce(chr(10)||r.copy,'')
     ||case when r.available is null then ''
        when r.available<=local_now+interval '10 min' then chr(10)||'今すぐご案内可能です。'
        else chr(10)||'最短'||private.pr_hhmm(day,r.available)||'からご案内可能です。' end
     ||chr(10)||'ご予約はWEB予約・お電話・LINEで承ります。';
   item:=private.pr_post_news(p_store,'news_attendance',day,slot,expires,'本日出勤：'||r.name,profile_text,r.photo,r.cast_id,'schedule');
   news_done:=item is not null;
  end if;
 end if;

 -- 今すぐご案内・セラピスト紹介・クーポン紹介は、時間帯ごとに順番を回す
 if not news_done then
  if cfg.news then kinds:=array_append(kinds,'news'); end if;
  if cfg.news_intro then kinds:=array_append(kinds,'news_intro'); end if;
  if cfg.news_coupon then kinds:=array_append(kinds,'news_coupon'); end if;
  n:=coalesce(array_length(kinds,1),0);
  for i in 0..n-1 loop
   exit when news_done;
   k:=kinds[1+(slot+i)%n];
   if k='news' then
    if msg is null then continue; end if;
    select d.name into cp from public.discounts d where d.id=cfg.coupon_id and d.store_id=p_store and d.is_active and d.public_booking_enabled and coalesce(d.min_advance_days,0)=0;
    profile_text:=to_char(day,'MM/DD')||'の出勤情報。'||msg||coalesce(' ご利用いただけるクーポン：'||cp||'。条件は予約画面でご確認ください。','');
    if exists(select 1 from public.pr_desk_history where store_id=p_store and kind='news' and business_day=day and body=profile_text) then continue; end if;
    item:=private.pr_post_news(p_store,'news',day,slot,expires,person||' 本日のご案内',profile_text,private.pr_cast_photo(cid),cid,'schedule');
    news_done:=item is not null;
   elsif k='news_intro' then
    -- 在籍で写真と紹介文のある人を、前に紹介してから長い順に（1人は1日1回まで）
    select c.id, c.name, c.age, private.pr_cast_photo(c.id) as photo,
      left(coalesce(nullif(trim(c.shop_comment),''),nullif(trim(c.profile),'')),400) as body
    into r
    from public.casts c
    where c.store_id=p_store and c.is_active and c.is_visible and c.name<>'源氏名未定'
      and private.pr_cast_photo(c.id) is not null
      and coalesce(nullif(trim(c.shop_comment),''),nullif(trim(c.profile),'')) is not null
      -- お客様向けの文に「ハンド」は出さない
      and strpos(coalesce(nullif(trim(c.shop_comment),''),nullif(trim(c.profile),'')),'ハンド')=0
      and not exists(select 1 from public.pr_desk_history h join public.hp_articles a on a.id=h.article_id
        where h.store_id=p_store and h.kind='news_intro' and h.business_day=day and c.id=any(a.news_cast_ids))
    order by (select max(h.created_at) from public.pr_desk_history h join public.hp_articles a on a.id=h.article_id
        where h.store_id=p_store and h.kind='news_intro' and c.id=any(a.news_cast_ids)) nulls first, c.name
    limit 1;
    if not found then continue; end if;
    profile_text:='【セラピスト紹介】'||r.name||coalesce('（'||r.age||'歳）','')||chr(10)||r.body
      ||chr(10)||chr(10)||'出勤予定・ご予約はHPからご確認ください。';
    item:=private.pr_post_news(p_store,'news_intro',day,slot,expires,'セラピスト紹介：'||r.name,profile_text,r.photo,r.id,'news');
    news_done:=item is not null;
   elsif k='news_coupon' then
    -- 画像を登録したクーポンを、その日1回ずつ。前に紹介してから長い順
    select d.id, d.name, d.discount_value, d.min_advance_days, d.terms, cfg.news_images->>('coupon:'||d.id) as photo
    into r
    from public.discounts d
    where d.store_id=p_store and d.is_active and nullif(cfg.news_images->>('coupon:'||d.id),'') is not null
      and not exists(select 1 from public.pr_desk_history h where h.store_id=p_store and h.kind='news_coupon' and h.business_day=day and strpos(h.body,d.name)>0)
    order by (select max(h.created_at) from public.pr_desk_history h where h.store_id=p_store and h.kind='news_coupon' and strpos(h.body,d.name)>0) nulls first,
      d.display_order nulls last, d.name
    limit 1;
    if not found then continue; end if;
    profile_text:='【クーポンのご案内】'||chr(10)||r.name
      ||case when coalesce(r.discount_value,0)>0 then chr(10)||to_char(r.discount_value,'FM999,999,999')||'円OFF' else '' end
      ||case when coalesce(r.min_advance_days,0)>0 then chr(10)||'※'||r.min_advance_days||'日前までのご予約が対象です' else '' end
      ||coalesce(chr(10)||(select string_agg('・'||t,chr(10)) from unnest(r.terms) t where nullif(trim(t),'') is not null),'')
      ||chr(10)||chr(10)||'ご予約の際にお使いいただけます。条件は予約画面でご確認ください。';
    item:=private.pr_post_news(p_store,'news_coupon',day,slot,expires,'クーポン：'||r.name,profile_text,r.photo,null,'coupon');
    news_done:=item is not null;
   end if;
  end loop;
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
end $function$;

-- 配信の取り出し：ニュースの4種類とも記事（画像のURL入り）を渡す。今すぐご案内だけは、まだ同じ空きか確かめる
create or replace function public.pr_desk_claim(p_store uuid, p_run text)
returns jsonb language plpgsql security definer set search_path='' as $function$
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
 or (row.kind in ('news_attendance','news_intro','news_coupon') and not exists(select 1 from public.hp_articles a where a.id=row.article_id and a.is_published and a.estama_status='pending'))
 then update public.pr_desk_history set status='skipped',finished_at=now() where id=row.id; continue; end if;
 update public.pr_desk_history set status='running',run_id=p_run where id=row.id;
 result:=to_jsonb(row);
 if row.kind in ('news','news_attendance','news_intro','news_coupon') then
 update public.hp_articles set estama_status='posting' where id=row.article_id;
 result:=result||jsonb_build_object('article',(select jsonb_build_object('id',a.id,'store_id',a.store_id,'title',a.title,'content',a.content,'image_urls',a.image_urls) from public.hp_articles a where a.id=row.article_id));
 end if;
 return result;
 end loop;
 return null;
end $function$;

revoke all on function private.pr_cast_photo(uuid), private.pr_hhmm(date,timestamp),
  private.pr_post_news(uuid,text,date,integer,timestamptz,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.pr_desk_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.pr_desk_claim(uuid,text) to service_role;

-- 画面の「プレビュー」用：今セラピストの記事に使う写真が無い人（パネル写真が未登録）
create or replace function public.pr_news_photo_status(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.can_manage_store(p_store),false) then raise insufficient_privilege; end if;
 return jsonb_build_object(
  'without_photo',(select coalesce(jsonb_agg(c.name order by c.name),'[]'::jsonb) from public.casts c
     where c.store_id=p_store and c.is_active and c.is_visible and c.name<>'源氏名未定' and private.pr_cast_photo(c.id) is null),
  'without_intro',(select coalesce(jsonb_agg(c.name order by c.name),'[]'::jsonb) from public.casts c
     where c.store_id=p_store and c.is_active and c.is_visible and c.name<>'源氏名未定'
       and coalesce(nullif(trim(c.shop_comment),''),nullif(trim(c.profile),'')) is null)
 );
end $$;
revoke all on function public.pr_news_photo_status(uuid) from public, anon;
grant execute on function public.pr_news_photo_status(uuid) to authenticated;
