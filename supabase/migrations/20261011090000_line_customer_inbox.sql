-- お客様用の公式LINEの見張り（LINE対応 /line-inbox）
-- お客様から届いたメッセージを記録してスタッフのスマホへ知らせ、決めた時間（既定5分）のうちに
-- スタッフが返信（または「対応済み」）しなければ、AI（Claude）が考えた一次対応の返事を自動で送る。
-- LINE公式アカウントの管理画面（チャット）から手で返信したことはAPIで分からないので、
-- 管理画面アプリの「LINE対応」から返信するか、LINEで返したら「対応済み」を押す。
-- 認証情報（Channel ID / Channel secret）は Vault（line_customer_channel:<store_id>）だけに入れる。

create table if not exists public.line_customer_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  enabled boolean not null default false,
  auto_reply boolean not null default true,
  wait_minutes integer not null default 5 check (wait_minutes between 1 and 60),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  webhook_key text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  bot_basic_id text,
  bot_name text,
  verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.line_customer_threads (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  line_user_id text not null,
  display_name text,
  picture_url text,
  -- waiting = 返事待ち / replying = 自動応答を作っている / handled = スタッフが対応 / auto_replied = 自動で一次対応した / failed = 自動応答に失敗
  status text not null default 'waiting' check (status in ('waiting', 'replying', 'handled', 'auto_replied', 'failed')),
  waiting_since timestamptz,
  last_message_at timestamptz not null default now(),
  last_message_text text,
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  auto_replied_at timestamptz,
  reply_claimed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (store_id, line_user_id)
);
create index if not exists idx_line_customer_threads_waiting on public.line_customer_threads (status, waiting_since);
create index if not exists idx_line_customer_threads_store on public.line_customer_threads (store_id, last_message_at desc);

create table if not exists public.line_customer_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  thread_id uuid not null references public.line_customer_threads(id) on delete cascade,
  -- in = お客様から / staff = 管理画面から返信 / ai = 自動応答
  direction text not null check (direction in ('in', 'staff', 'ai')),
  message_type text not null default 'text',
  text text,
  line_message_id text unique,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_line_customer_messages_thread on public.line_customer_messages (thread_id, created_at);

alter table public.line_customer_settings enable row level security;
alter table public.line_customer_threads enable row level security;
alter table public.line_customer_messages enable row level security;
revoke all on public.line_customer_settings from anon, authenticated;
revoke all on public.line_customer_threads from anon;
revoke all on public.line_customer_messages from anon;
grant select on public.line_customer_threads to authenticated;
grant select on public.line_customer_messages to authenticated;
create policy line_customer_threads_read on public.line_customer_threads for select to authenticated
  using (store_id in (select public.current_store_ids()));
create policy line_customer_messages_read on public.line_customer_messages for select to authenticated
  using (store_id in (select public.current_store_ids()));

do $$ begin
  alter publication supabase_realtime add table public.line_customer_threads;
exception when others then null; end $$;

create or replace function private.line_customer_secret_name(p_store_id uuid)
returns text language sql immutable as $$ select 'line_customer_channel:' || p_store_id::text $$;

-- 管理画面：設定を読む（店長・オーナー）。Channel secret は返さない
create or replace function public.get_line_customer_settings(p_store_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.line_customer_settings;
  v_channel jsonb;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  select * into v from public.line_customer_settings where store_id = p_store_id;
  select decrypted_secret::jsonb into v_channel from vault.decrypted_secrets where name = private.line_customer_secret_name(p_store_id);
  return jsonb_build_object(
    'enabled', coalesce(v.enabled, false),
    'autoReply', coalesce(v.auto_reply, true),
    'waitMinutes', coalesce(v.wait_minutes, 5),
    'instructions', v.instructions,
    'webhookKey', v.webhook_key,
    'botBasicId', v.bot_basic_id,
    'botName', v.bot_name,
    'verifiedAt', v.verified_at,
    'lastError', v.last_error,
    'channelId', v_channel ->> 'channel_id',
    'configured', coalesce(v_channel ->> 'channel_id', '') <> '' and coalesce(v_channel ->> 'channel_secret', '') <> ''
  );
end;
$$;

-- 管理画面：設定を保存（店長・オーナー）。p_channel_secret が空なら今のまま
create or replace function public.save_line_customer_settings(
  p_store_id uuid,
  p_enabled boolean,
  p_auto_reply boolean,
  p_wait_minutes integer,
  p_instructions text,
  p_channel_id text,
  p_channel_secret text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.line_customer_secret_name(p_store_id);
  v_old jsonb;
  v_new jsonb;
  v_secret_id uuid;
begin
  if auth.uid() is null or not public.can_manage_store(p_store_id) then
    raise exception using message = 'この店舗を管理する権限がありません', errcode = '42501';
  end if;
  if coalesce(btrim(p_channel_id), '') <> '' and btrim(p_channel_id) !~ '^[0-9]{6,20}$' then
    raise exception using message = 'Channel ID は数字だけです（LINE Developers の Basic settings）', errcode = '22023';
  end if;
  if coalesce(btrim(p_channel_secret), '') <> '' and btrim(p_channel_secret) !~ '^[0-9a-f]{32}$' then
    raise exception using message = 'Channel secret は32文字の英数字です（LINE Developers の Basic settings）', errcode = '22023';
  end if;

  insert into public.line_customer_settings (store_id, enabled, auto_reply, wait_minutes, instructions, updated_at)
  values (p_store_id, coalesce(p_enabled, false), coalesce(p_auto_reply, true), least(greatest(coalesce(p_wait_minutes, 5), 1), 60),
          nullif(btrim(p_instructions), ''), now())
  on conflict (store_id) do update set
    enabled = excluded.enabled, auto_reply = excluded.auto_reply, wait_minutes = excluded.wait_minutes,
    instructions = excluded.instructions, updated_at = now();

  select id, decrypted_secret::jsonb into v_secret_id, v_old from vault.decrypted_secrets where name = v_name;
  v_new := jsonb_build_object(
    'channel_id', coalesce(nullif(btrim(p_channel_id), ''), v_old ->> 'channel_id'),
    'channel_secret', coalesce(nullif(btrim(p_channel_secret), ''), v_old ->> 'channel_secret')
  );
  if v_new is distinct from v_old then
    if v_secret_id is null then
      perform vault.create_secret(v_new::text, v_name, 'お客様用LINE公式アカウントの Channel ID / secret');
    else
      perform vault.update_secret(v_secret_id, v_new::text);
    end if;
    update public.line_customer_settings set verified_at = null, bot_basic_id = null, bot_name = null where store_id = p_store_id;
  end if;
  return public.get_line_customer_settings(p_store_id);
end;
$$;

-- Edge Function（service_role）用：Webhook の鍵（URLの k=）から店舗と認証情報を読む
create or replace function public.get_line_customer_channel(p_webhook_key text default null, p_store_id uuid default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'storeId', s.store_id,
    'enabled', s.enabled,
    'autoReply', s.auto_reply,
    'waitMinutes', s.wait_minutes,
    'instructions', s.instructions,
    'channelId', v.decrypted_secret::jsonb ->> 'channel_id',
    'channelSecret', v.decrypted_secret::jsonb ->> 'channel_secret'
  )
  from public.line_customer_settings s
  left join vault.decrypted_secrets v on v.name = private.line_customer_secret_name(s.store_id)
  where (p_webhook_key is not null and s.webhook_key = p_webhook_key)
     or (p_webhook_key is null and s.store_id = p_store_id)
  limit 1
$$;

-- Edge Function（service_role）用：お客様からのメッセージを記録し、返事待ちにする
create or replace function public.record_line_customer_message(
  p_store_id uuid, p_line_user_id text, p_display_name text, p_picture_url text,
  p_message_type text, p_text text, p_line_message_id text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_thread uuid;
begin
  insert into public.line_customer_threads as t (store_id, line_user_id, display_name, picture_url, status, waiting_since, last_message_at, last_message_text)
  values (p_store_id, p_line_user_id, p_display_name, p_picture_url, 'waiting', now(), now(), left(p_text, 500))
  on conflict (store_id, line_user_id) do update set
    display_name = coalesce(excluded.display_name, t.display_name),
    picture_url = coalesce(excluded.picture_url, t.picture_url),
    -- 返事待ちの間に続けて送られたものは、最初の時刻から数える
    waiting_since = case when t.status in ('waiting', 'replying') then t.waiting_since else now() end,
    status = case when t.status = 'replying' then 'replying' else 'waiting' end,
    error = null,
    last_message_at = now(),
    last_message_text = excluded.last_message_text
  returning id into v_thread;

  insert into public.line_customer_messages (store_id, thread_id, direction, message_type, text, line_message_id)
  values (p_store_id, v_thread, 'in', coalesce(p_message_type, 'text'), p_text, p_line_message_id)
  on conflict (line_message_id) do nothing;
  return v_thread;
end;
$$;

-- Edge Function（service_role）用：自動応答を作る権利を取る（二重送信を防ぐ）。返事待ちで時間を過ぎたものだけ
create or replace function public.claim_line_auto_reply(p_thread_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.line_customer_threads;
begin
  update public.line_customer_threads as th set status = 'replying', reply_claimed_at = now()
  from public.line_customer_settings s
  where th.id = p_thread_id and s.store_id = th.store_id and s.enabled and s.auto_reply
    and (th.status = 'waiting' or (th.status = 'replying' and th.reply_claimed_at < now() - interval '5 minutes'))
    and th.waiting_since <= now() - make_interval(mins => s.wait_minutes)
  returning th.* into t;
  if t.id is null then return null; end if;
  return jsonb_build_object('threadId', t.id, 'storeId', t.store_id, 'lineUserId', t.line_user_id, 'displayName', t.display_name, 'waitingSince', t.waiting_since);
end;
$$;

-- Edge Function（service_role）用：送ったメッセージを記録して状態を変える
create or replace function public.finish_line_customer_reply(
  p_thread_id uuid, p_direction text, p_ok boolean, p_text text, p_error text, p_user_id uuid default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.line_customer_threads where id = p_thread_id;
  if v_store is null then return; end if;
  if p_ok then
    insert into public.line_customer_messages (store_id, thread_id, direction, text, sent_by)
    values (v_store, p_thread_id, p_direction, p_text, p_user_id);
    if p_direction = 'ai' then
      -- 自動応答の後にお客様が続けて送ってきたら、その分はまた返事待ちのまま
      update public.line_customer_threads set
        status = case when status = 'replying' then 'auto_replied' else status end,
        auto_replied_at = now(), error = null
      where id = p_thread_id;
    else
      update public.line_customer_threads set status = 'handled', handled_at = now(), handled_by = p_user_id, error = null, waiting_since = null
      where id = p_thread_id;
    end if;
  elsif p_direction = 'ai' then
    update public.line_customer_threads set status = 'failed', error = left(p_error, 500) where id = p_thread_id and status = 'replying';
  end if;
end;
$$;

-- 管理画面：LINEで返した・返事不要 → 対応済み（その店舗のスタッフ）
create or replace function public.mark_line_thread_handled(p_thread_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.line_customer_threads where id = p_thread_id;
  if v_store is null or auth.uid() is null or v_store not in (select public.current_store_ids()) then
    raise exception using message = 'この店舗のLINEを操作する権限がありません', errcode = '42501';
  end if;
  update public.line_customer_threads
  set status = 'handled', handled_at = now(), handled_by = auth.uid(), waiting_since = null, error = null
  where id = p_thread_id and status in ('waiting', 'failed', 'auto_replied');
end;
$$;

-- Edge Function（service_role）用：LINEの接続確認の結果
create or replace function public.set_line_customer_verified(p_store_id uuid, p_basic_id text, p_name text, p_error text)
returns void
language sql security definer set search_path = '' as $$
  update public.line_customer_settings set
    verified_at = case when p_error is null then now() else verified_at end,
    bot_basic_id = coalesce(p_basic_id, bot_basic_id),
    bot_name = coalesce(p_name, bot_name),
    last_error = p_error
  where store_id = p_store_id
$$;

revoke all on function public.get_line_customer_settings(uuid) from public, anon;
grant execute on function public.get_line_customer_settings(uuid) to authenticated;
revoke all on function public.save_line_customer_settings(uuid, boolean, boolean, integer, text, text, text) from public, anon;
grant execute on function public.save_line_customer_settings(uuid, boolean, boolean, integer, text, text, text) to authenticated;
revoke all on function public.mark_line_thread_handled(uuid) from public, anon;
grant execute on function public.mark_line_thread_handled(uuid) to authenticated;
revoke all on function public.get_line_customer_channel(text, uuid) from public, anon, authenticated;
grant execute on function public.get_line_customer_channel(text, uuid) to service_role;
revoke all on function public.record_line_customer_message(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_line_customer_message(uuid, text, text, text, text, text, text) to service_role;
revoke all on function public.claim_line_auto_reply(uuid) from public, anon, authenticated;
grant execute on function public.claim_line_auto_reply(uuid) to service_role;
revoke all on function public.finish_line_customer_reply(uuid, text, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function public.finish_line_customer_reply(uuid, text, boolean, text, text, uuid) to service_role;
revoke all on function public.set_line_customer_verified(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_line_customer_verified(uuid, text, text, text) to service_role;

-- 自動応答の内部呼び出し用の秘密の値
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'line_customer_internal_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'line_customer_internal_secret', 'line-customer-reply の内部呼び出し');
  end if;
end $$;

create or replace function public.verify_line_customer_secret(candidate text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select candidate is not null and exists (
    select 1 from vault.decrypted_secrets where name = 'line_customer_internal_secret' and decrypted_secret = candidate
  );
$$;
revoke all on function public.verify_line_customer_secret(text) from public, anon, authenticated;
grant execute on function public.verify_line_customer_secret(text) to service_role;

-- 毎分：返事待ちのまま時間を過ぎた会話があるときだけ、Edge Function line-customer-reply を呼ぶ
create or replace function private.dispatch_line_auto_replies()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  select array_agg(t.id) into v_ids
  from public.line_customer_threads t
  join public.line_customer_settings s on s.store_id = t.store_id
  where s.enabled and s.auto_reply
    and (t.status = 'waiting' or (t.status = 'replying' and t.reply_claimed_at < now() - interval '5 minutes'))
    and t.waiting_since <= now() - make_interval(mins => s.wait_minutes)
    -- 半日以上前の返事待ち（設定をオンにする前のものなど）には自動で返さない
    and t.waiting_since > now() - interval '12 hours';
  if v_ids is null then return 0; end if;
  perform net.http_post(
    url := 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/line-customer-reply',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-line-customer-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'line_customer_internal_secret')
    ),
    body := jsonb_build_object('action', 'auto', 'threadIds', to_jsonb(v_ids)),
    timeout_milliseconds := 120000
  );
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

do $$ begin
  perform cron.unschedule('line-customer-auto-reply-every-minute');
exception when others then null; end $$;
select cron.schedule('line-customer-auto-reply-every-minute', '* * * * *', 'select private.dispatch_line_auto_replies()');

-- スマホ通知：お客様からLINEが来た（返事待ちになった）・自動応答に失敗した
create or replace function public.trg_push_notify()
returns trigger
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  v_event text;
  v_store uuid;
  v_id uuid;
  v_resubmitted boolean := false;
  v_topic text;
begin
  if tg_table_name = 'reservations' then
    if new.booking_origin not in ('web_form', 'cast_form') then return new; end if;
    v_event := 'web_booking'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'sms_logs' then
    if new.direction is distinct from 'inbound' then return new; end if;
    v_event := 'sms_reply'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'sms_balance_alerts' then
    v_event := 'sms_balance'; v_id := new.id;
  elsif tg_table_name = 'daily_sales_records' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'daily_sales'; v_store := new.store_id; v_id := new.id; v_resubmitted := tg_op = 'UPDATE';
  elsif tg_table_name = 'settlement_approvals' then
    if new.shortage_method is distinct from 'transfer' or new.shortage_settled_at is not null then return new; end if;
    v_event := 'settlement_transfer'; v_store := new.store_id; v_id := new.clearance_id;
  elsif tg_table_name = 'cast_bank_accounts' then
    select a.clearance_id, a.store_id into v_id, v_store from public.settlement_approvals a
    where a.cast_id = new.cast_id and a.shortage_method = 'transfer' and a.shortage_settled_at is null and a.shortage_amount > 0
    order by a.date desc limit 1;
    if v_id is null then return new; end if;
    v_event := 'settlement_transfer';
  elsif tg_table_name = 'estama_login_alerts' then
    v_event := 'estama_login'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'line_customer_messages' then
    if new.direction is distinct from 'in' then return new; end if;
    v_event := 'line_inbox'; v_store := new.store_id; v_id := new.id;
  elsif tg_table_name = 'line_customer_threads' then
    if new.status is distinct from 'failed' or old.status is not distinct from 'failed' then return new; end if;
    v_event := 'line_inbox_failed'; v_store := new.store_id; v_id := new.id;
  else
    return new;
  end if;
  v_topic := case when v_event = 'settlement_transfer' then 'daily_sales' when v_event = 'line_inbox_failed' then 'line_inbox' else v_event end;
  if not exists (
    select 1 from public.push_subscriptions s where v_topic = any (s.topics) and (v_store is null or s.store_id = v_store)
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

drop trigger if exists line_customer_messages_push_notify on public.line_customer_messages;
create trigger line_customer_messages_push_notify after insert on public.line_customer_messages
  for each row execute function public.trg_push_notify();
drop trigger if exists line_customer_threads_push_notify on public.line_customer_threads;
create trigger line_customer_threads_push_notify after update of status on public.line_customer_threads
  for each row execute function public.trg_push_notify();
