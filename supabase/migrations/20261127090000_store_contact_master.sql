-- 艶華OSの「連絡先・SNS（正本）」：店舗情報（store_info）の 電話・公式LINE・メール・X・外部ブログ（O2の店舗ページ）を正本にする。
-- 直したら、HPのSNSリンク（site_content の store_sns_x / store_sns_line / store_sns_o2）をそろえ、
-- エステ魂・O2の店舗ページへの反映待ちを store_contact_sync に積む（反映するのは自動化のワーカー）。
alter table public.store_info add column if not exists blog_url text;
grant select (blog_url) on public.store_info to anon;

create table if not exists public.store_contact_sync (
  store_id     uuid not null references public.stores(id) on delete cascade,
  target       text not null check (target in ('estama', 'o2')),
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'review_required')),
  requested_at timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  attempts     integer not null default 0,
  values_snapshot jsonb not null default '{}'::jsonb,
  result       jsonb,
  error        text,
  primary key (store_id, target)
);
alter table public.store_contact_sync enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='store_contact_sync' and policyname='store_contact_sync_read') then
    create policy "store_contact_sync_read" on public.store_contact_sync for select to authenticated using (store_id in (select public.current_store_ids()));
  end if;
end $$;
revoke all on public.store_contact_sync from anon;
revoke insert, update, delete on public.store_contact_sync from authenticated;
grant select on public.store_contact_sync to authenticated;

create or replace function private.store_contact_values(p_store_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('phone', si.phone, 'line_url', si.line_url, 'email', si.email, 'x_url', si.twitter_url, 'blog_url', si.blog_url)
  from public.store_info si where si.store_id = p_store_id limit 1
$$;

create or replace function private.on_store_contact_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_values jsonb := jsonb_build_object('phone', new.phone, 'line_url', new.line_url, 'email', new.email, 'x_url', new.twitter_url, 'blog_url', new.blog_url);
  v_key text;
  v_val text;
begin
  if tg_op = 'UPDATE'
     and old.phone is not distinct from new.phone and old.line_url is not distinct from new.line_url
     and old.email is not distinct from new.email and old.twitter_url is not distinct from new.twitter_url
     and old.blog_url is not distinct from new.blog_url then
    return new;
  end if;
  -- HP のSNSリンク（ページ上・フッター・メルマガ）を正本にそろえる
  for v_key, v_val in select * from (values ('store_sns_x', new.twitter_url), ('store_sns_line', new.line_url), ('store_sns_o2', new.blog_url)) as t(k, v) loop
    if nullif(btrim(coalesce(v_val, '')), '') is not null then
      insert into public.site_content (store_id, key, value) values (new.store_id, v_key, v_val)
      on conflict (store_id, key) do update set value = excluded.value;
    end if;
  end loop;
  -- エステ魂・O2 の店舗ページは反映待ちに積む
  insert into public.store_contact_sync (store_id, target, status, requested_at, attempts, values_snapshot, error, result)
  select new.store_id, t, 'pending', now(), 0, v_values, null, null from unnest(array['estama', 'o2']) t
  on conflict (store_id, target) do update
    set status = 'pending', requested_at = now(), attempts = 0, values_snapshot = excluded.values_snapshot, error = null, result = null;
  return new;
end;
$$;

create or replace trigger trg_store_contact_change after insert or update on public.store_info
  for each row execute function private.on_store_contact_change();
