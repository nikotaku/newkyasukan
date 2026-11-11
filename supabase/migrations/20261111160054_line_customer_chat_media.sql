-- LINE会話の画像・送信状態。画像は非公開で、店舗スタッフのSELECTだけ許可する。
alter table public.line_customer_messages
  add column if not exists media_path text,
  add column if not exists payload_hash text,
  add column if not exists delivery_status text not null default 'sent' check (delivery_status in ('sending','sent','failed')),
  add column if not exists updated_at timestamptz not null default now();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('line-customer-media','line-customer-media',false,5242880,array['image/jpeg','image/png'])
on conflict (id) do nothing;
create policy line_customer_media_read on storage.objects for select to authenticated
using (bucket_id='line-customer-media' and (storage.foldername(name))[1] in (select public.current_store_ids()::text));

do $$ begin
  alter publication supabase_realtime add table public.line_customer_messages;
exception when duplicate_object then null; end $$;

-- 再配信を先に判定し、重複で「対応済み」が「返事待ち」に戻らないようにする。
create or replace function public.record_line_customer_message(
  p_store_id uuid,p_line_user_id text,p_display_name text,p_picture_url text,
  p_message_type text,p_text text,p_line_message_id text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_thread uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_line_user_id,0));
  select thread_id into v_thread from public.line_customer_messages where line_message_id=p_line_message_id;
  if v_thread is not null then return v_thread; end if;
  insert into public.line_customer_threads as t(store_id,line_user_id,display_name,picture_url,status,waiting_since,last_message_at,last_message_text)
  values(p_store_id,p_line_user_id,p_display_name,p_picture_url,'waiting',now(),now(),left(p_text,500))
  on conflict(store_id,line_user_id) do update set
    display_name=coalesce(excluded.display_name,t.display_name),picture_url=coalesce(excluded.picture_url,t.picture_url),
    waiting_since=case when t.status in ('waiting','replying') then t.waiting_since else now() end,
    status=case when t.status='replying' then 'replying' else 'waiting' end,error=null,
    last_message_at=now(),last_message_text=excluded.last_message_text
  returning id into v_thread;
  insert into public.line_customer_messages(store_id,thread_id,direction,message_type,text,line_message_id)
  values(p_store_id,v_thread,'in',coalesce(p_message_type,'text'),p_text,p_line_message_id);
  return v_thread;
end $$;

-- 送信が受理された後だけ履歴を確定する。送信中に届いた新着は返事待ちのまま残す。
create or replace function public.complete_line_staff_message(p_message_id uuid,p_started_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare m public.line_customer_messages;
begin
  select * into m from public.line_customer_messages where id=p_message_id and direction='staff' for update;
  if m.id is null then raise exception 'message not found'; end if;
  update public.line_customer_messages set delivery_status='sent',updated_at=now() where id=m.id;
  update public.line_customer_threads set
    status=case when last_message_at<=p_started_at then 'handled' else status end,
    waiting_since=case when last_message_at<=p_started_at then null else waiting_since end,
    handled_at=now(),handled_by=m.sent_by,error=null,
    last_message_text=case when last_message_at<=p_started_at then left(m.text,500) else last_message_text end,
    last_message_at=case when last_message_at<=p_started_at then now() else last_message_at end
  where id=m.thread_id;
end $$;
revoke all on function public.complete_line_staff_message(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_line_staff_message(uuid,timestamptz) to service_role;
