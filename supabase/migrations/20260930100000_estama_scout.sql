-- エステ魂「スカウト求人」の自動化：毎日決まった時刻に候補を集め（Browserbase）、
-- 管理画面アプリへ「この人たちに送っていいですか？」と通知し、OKが出たら送信する。
--
-- 流れ： pg_cron（5分ごと） → private.dispatch_estama_scout()
--          ├ 今日の候補がまだない & 設定時刻を過ぎた → 候補集め（mode = collect）
--          └ OK済み（approved）のまとまりがある      → 送信（mode = send）
--        → Vercel /api/cron/estama-appeal?action=estama-scout（一回限りのトークン）
--        候補がそろったら status = pending_approval になり、トリガーでスマホ通知（push-notify）

-- ── 設定（店舗ごと） ─────────────────────────────────────────────
create table public.estama_scout_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  enabled boolean not null default false,
  daily_count smallint not null default 10 check (daily_count between 1 and 30),
  propose_at time not null default '11:00',
  message text check (message is null or length(message) <= 2000),
  template_name text check (template_name is null or length(template_name) <= 100),
  preferred_areas text[] not null default array['仙台', '宮城', '山形', '福島', '岩手', '秋田', '青森', '東北'],
  only_preferred boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.estama_scout_settings enable row level security;
revoke all on public.estama_scout_settings from anon;
grant select, insert, update on public.estama_scout_settings to authenticated;
grant all on public.estama_scout_settings to service_role;

create policy estama_scout_settings_managers on public.estama_scout_settings
  for all to authenticated
  using ((select public.can_manage_store(store_id)))
  with check ((select public.can_manage_store(store_id)));

-- ── 1日分のまとまり ───────────────────────────────────────────────
create table public.estama_scout_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  scout_date date not null,
  status text not null default 'collecting' check (status in (
    'collecting',        -- 候補を集めている
    'pending_approval',  -- OK待ち（通知済み）
    'approved',          -- OKが出た・送信待ち
    'sending',           -- 送信中
    'done',              -- 送信が終わった（一部失敗を含む）
    'empty',             -- 送れる候補がいなかった
    'cancelled',         -- 今日は送らない
    'failed'             -- 候補集め・送信の途中で止まった
  )),
  scout_url text,
  remaining_before integer,
  remaining_after integer,
  candidate_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, scout_date)
);
create index estama_scout_batches_status_idx on public.estama_scout_batches (status)
  where status in ('collecting', 'approved', 'sending');

alter table public.estama_scout_batches enable row level security;
revoke all on public.estama_scout_batches from anon, authenticated;
grant select on public.estama_scout_batches to authenticated;
grant all on public.estama_scout_batches to service_role;

create policy estama_scout_batches_managers_read on public.estama_scout_batches
  for select to authenticated
  using ((select public.can_manage_store(store_id)));

-- ── 候補（1人ずつ） ─────────────────────────────────────────────
create table public.estama_scout_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.estama_scout_batches(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  position smallint not null,
  external_id text not null,
  display_name text,
  summary text,
  profile_url text,
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in (
    'proposed',   -- 候補（OK待ち）
    'approved',   -- 送る
    'excluded',   -- 送らない（外した・今日は送らない）
    'sending',    -- 送信ボタンを押す直前に記録。以後の失敗は uncertain
    'sent',
    'failed',     -- ボタンを押す前に失敗（再送してよい）
    'uncertain'   -- 押した後に結果を確認できなかった（重複送信を防ぐため再送しない）
  )),
  click_started_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, external_id)
);
create index estama_scout_candidates_batch_idx on public.estama_scout_candidates (batch_id, position);
create index estama_scout_candidates_sent_idx on public.estama_scout_candidates (store_id, external_id)
  where status in ('sent', 'sending', 'uncertain');
create index estama_scout_candidates_store_idx on public.estama_scout_candidates (store_id);

alter table public.estama_scout_candidates enable row level security;
revoke all on public.estama_scout_candidates from anon, authenticated;
grant select on public.estama_scout_candidates to authenticated;
grant all on public.estama_scout_candidates to service_role;

create policy estama_scout_candidates_managers_read on public.estama_scout_candidates
  for select to authenticated
  using ((select public.can_manage_store(store_id)));

-- ── Vercelを呼ぶ（一回限りのトークン） ──────────────────────────────
create or replace function private.estama_scout_call(p_store_id uuid, p_mode text, p_batch_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_request_id bigint;
begin
  insert into public.estama_sync_tokens (token_hash, purpose, expires_at)
  values (
    encode(extensions.digest(v_raw_token, 'sha256'), 'hex'),
    'estama-scout:' || p_store_id::text,
    now() + interval '10 minutes'
  );
  select net.http_post(
    url := 'https://newkyasukan.vercel.app/api/cron/estama-appeal?action=estama-scout',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('token', v_raw_token, 'mode', p_mode, 'batchId', p_batch_id),
    timeout_milliseconds := 300000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.estama_scout_call(uuid, text, uuid) from public, anon, authenticated;

-- 5分ごと：止まったものを片付け、候補集め・送信が必要な店舗だけVercelを呼ぶ
create or replace function private.dispatch_estama_scout()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('Asia/Tokyo', now())::date;
  v_now_time time := timezone('Asia/Tokyo', now())::time;
  v_calls integer := 0;
  r record;
  v_batch_id uuid;
begin
  -- 12分以上動きのない処理を安全側に倒す（押す前の送信は failed、押した後は uncertain）
  update public.estama_scout_candidates as candidate
  set status = case when candidate.click_started_at is null then 'failed' else 'uncertain' end,
      error_message = case when candidate.click_started_at is null
        then '送信処理が途中で止まりました'
        else '送信ボタンを押した後に止まったため、重複を防ぐため再送していません' end,
      updated_at = now()
  from public.estama_scout_batches as batch
  where candidate.batch_id = batch.id
    and batch.status = 'sending'
    and candidate.status in ('sending', 'approved')
    and batch.updated_at < now() - interval '12 minutes';

  update public.estama_scout_batches as batch
  set status = case when batch.status = 'collecting' then 'failed' else 'done' end,
      error_message = coalesce(batch.error_message, case when batch.status = 'collecting'
        then '候補集めが途中で止まりました' else '送信が途中で止まりました' end),
      sent_count = (select count(*) from public.estama_scout_candidates c where c.batch_id = batch.id and c.status = 'sent'),
      failed_count = (select count(*) from public.estama_scout_candidates c where c.batch_id = batch.id and c.status in ('failed', 'uncertain')),
      finished_at = now(),
      updated_at = now()
  where batch.status in ('collecting', 'sending')
    and batch.updated_at < now() - interval '12 minutes';

  delete from public.estama_sync_tokens
  where purpose like 'estama-scout:%' and expires_at < now() - interval '1 day';
  delete from private.estama_scout_runs where expires_at <= now();

  -- OK済みで送信待ち（時間切れの続きを含む）のまとまりを送る。毎日の自動がオフでも手動で集めた分は送る
  for r in
    select distinct on (batch.store_id) batch.store_id, batch.id
    from public.estama_scout_batches as batch
    join public.automation_connections as connection
      on connection.store_id = batch.store_id
     and connection.provider = 'estama'
     and connection.status = 'ready'
     and connection.browserbase_context_id is not null
    where batch.status = 'approved'
    order by batch.store_id, batch.scout_date desc
  loop
    perform private.estama_scout_call(r.store_id, 'send', r.id);
    v_calls := v_calls + 1;
  end loop;

  for r in
    select settings.store_id, settings.propose_at
    from public.estama_scout_settings as settings
    join public.automation_connections as connection
      on connection.store_id = settings.store_id
     and connection.provider = 'estama'
     and connection.status = 'ready'
     and connection.browserbase_context_id is not null
    where settings.enabled
      and not exists (
        select 1 from public.estama_scout_batches as batch
        where batch.store_id = settings.store_id and batch.status in ('approved', 'sending')
      )
  loop
    v_batch_id := null;
    -- 今日の候補がまだなく、設定時刻を過ぎていれば集める
    if v_now_time >= r.propose_at and not exists (
      select 1 from public.estama_scout_batches as batch
      where batch.store_id = r.store_id and batch.scout_date = v_today
    ) then
      insert into public.estama_scout_batches (store_id, scout_date, status, started_at)
      values (r.store_id, v_today, 'collecting', now())
      on conflict (store_id, scout_date) do nothing
      returning id into v_batch_id;
      if v_batch_id is not null then
        perform private.estama_scout_call(r.store_id, 'collect', v_batch_id);
        v_calls := v_calls + 1;
      end if;
    end if;
  end loop;
  return v_calls;
end;
$$;
revoke all on function private.dispatch_estama_scout() from public, anon, authenticated;
grant execute on function private.dispatch_estama_scout() to service_role;

-- ── 管理画面から使う操作 ─────────────────────────────────────────
-- OK：選んだ人を送る（選ばなかった人は外す）。すぐに送信を始める
create or replace function public.approve_estama_scout_batch(p_batch_id uuid, p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.estama_scout_batches;
  v_count integer;
begin
  select * into v_batch from public.estama_scout_batches where id = p_batch_id for update;
  if v_batch.id is null or not public.can_manage_store(v_batch.store_id) then
    raise exception 'このスカウトは操作できません' using errcode = '42501';
  end if;
  if v_batch.status <> 'pending_approval' then
    raise exception 'このスカウトはもうOK待ちではありません（%）', v_batch.status using errcode = '22023';
  end if;

  update public.estama_scout_candidates
  set status = case when id = any (coalesce(p_candidate_ids, '{}'::uuid[])) then 'approved' else 'excluded' end,
      updated_at = now()
  where batch_id = p_batch_id and status = 'proposed';

  select count(*) into v_count
  from public.estama_scout_candidates
  where batch_id = p_batch_id and status = 'approved';

  update public.estama_scout_batches
  set status = case when v_count > 0 then 'approved' else 'cancelled' end,
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  where id = p_batch_id;

  if v_count > 0 and exists (
    select 1 from public.automation_connections as connection
    where connection.store_id = v_batch.store_id
      and connection.provider = 'estama'
      and connection.status = 'ready'
  ) then
    perform private.estama_scout_call(v_batch.store_id, 'send', p_batch_id);
  end if;
  return jsonb_build_object('approved', v_count);
end;
$$;
revoke all on function public.approve_estama_scout_batch(uuid, uuid[]) from public, anon;
grant execute on function public.approve_estama_scout_batch(uuid, uuid[]) to authenticated;

-- 今日は送らない
create or replace function public.cancel_estama_scout_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.estama_scout_batches;
begin
  select * into v_batch from public.estama_scout_batches where id = p_batch_id for update;
  if v_batch.id is null or not public.can_manage_store(v_batch.store_id) then
    raise exception 'このスカウトは操作できません' using errcode = '42501';
  end if;
  if v_batch.status not in ('pending_approval', 'approved') then
    raise exception 'このスカウトは取り消せません（%）', v_batch.status using errcode = '22023';
  end if;
  update public.estama_scout_candidates
  set status = 'excluded', updated_at = now()
  where batch_id = p_batch_id and status in ('proposed', 'approved');
  update public.estama_scout_batches
  set status = 'cancelled', updated_at = now(), finished_at = now()
  where id = p_batch_id;
end;
$$;
revoke all on function public.cancel_estama_scout_batch(uuid) from public, anon;
grant execute on function public.cancel_estama_scout_batch(uuid) to authenticated;

-- 今すぐ候補を集め直す（今日の分が無い・空・失敗・取り消しのとき）
create or replace function public.request_estama_scout_candidates(p_store_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('Asia/Tokyo', now())::date;
  v_batch public.estama_scout_batches;
begin
  if not public.can_manage_store(p_store_id) then
    raise exception 'この店舗のスカウトは操作できません' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.automation_connections as connection
    where connection.store_id = p_store_id
      and connection.provider = 'estama'
      and connection.status = 'ready'
      and connection.browserbase_context_id is not null
  ) then
    raise exception 'エステ魂の自動化がログイン済みではありません（キャスト管理の「エスたま自動化」から再ログインしてください）'
      using errcode = '22023';
  end if;

  select * into v_batch from public.estama_scout_batches
  where store_id = p_store_id and scout_date = v_today
  for update;

  if v_batch.id is null then
    insert into public.estama_scout_batches (store_id, scout_date, status, started_at)
    values (p_store_id, v_today, 'collecting', now())
    returning * into v_batch;
  elsif v_batch.status in ('empty', 'failed', 'cancelled')
        and not exists (
          select 1 from public.estama_scout_candidates c
          where c.batch_id = v_batch.id and c.status in ('sent', 'sending', 'uncertain')
        ) then
    delete from public.estama_scout_candidates where batch_id = v_batch.id;
    update public.estama_scout_batches
    set status = 'collecting', started_at = now(), finished_at = null, error_message = null,
        candidate_count = 0, sent_count = 0, failed_count = 0, approved_at = null, approved_by = null,
        diagnostics = '{}'::jsonb, updated_at = now()
    where id = v_batch.id
    returning * into v_batch;
  else
    raise exception '今日のスカウトはすでに進んでいます（%）', v_batch.status using errcode = '22023';
  end if;

  perform private.estama_scout_call(p_store_id, 'collect', v_batch.id);
  return v_batch.id;
end;
$$;
revoke all on function public.request_estama_scout_candidates(uuid) from public, anon;
grant execute on function public.request_estama_scout_candidates(uuid) to authenticated;

-- ── Vercel（ブラウザ処理）から使う操作：実行トークン（claim_estama_scout_run）で守る ──
-- 今回の処理に必要な情報。送信のときは approved → sending に切り替えて、送る人の一覧を返す
create or replace function public.get_estama_scout_job(p_run_token text, p_batch_id uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := private.estama_scout_run_store(p_run_token);
  v_batch public.estama_scout_batches;
  v_settings public.estama_scout_settings;
begin
  if v_store_id is null then
    raise exception '実行トークンが無効です' using errcode = '42501';
  end if;
  select * into v_batch from public.estama_scout_batches
  where id = p_batch_id and store_id = v_store_id
  for update;
  if v_batch.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_settings from public.estama_scout_settings where store_id = v_store_id;

  if p_mode = 'collect' then
    if v_batch.status <> 'collecting' then
      return jsonb_build_object('ok', false, 'reason', 'status_' || v_batch.status);
    end if;
    update public.estama_scout_batches set updated_at = now() where id = v_batch.id;
    return jsonb_build_object(
      'ok', true,
      'dailyCount', coalesce(v_settings.daily_count, 10),
      'preferredAreas', to_jsonb(coalesce(v_settings.preferred_areas, '{}'::text[])),
      'onlyPreferred', coalesce(v_settings.only_preferred, false),
      -- 以前に送った（送ったかもしれない）人は候補にしない
      'excludedIds', coalesce((
        select jsonb_agg(distinct candidate.external_id)
        from public.estama_scout_candidates as candidate
        where candidate.store_id = v_store_id
          and candidate.status in ('sent', 'sending', 'uncertain')
      ), '[]'::jsonb)
    );
  elsif p_mode = 'send' then
    if v_batch.status <> 'approved' then
      return jsonb_build_object('ok', false, 'reason', 'status_' || v_batch.status);
    end if;
    update public.estama_scout_batches
    set status = 'sending', started_at = coalesce(started_at, now()), updated_at = now()
    where id = v_batch.id;
    return jsonb_build_object(
      'ok', true,
      'scoutUrl', v_batch.scout_url,
      'message', v_settings.message,
      'templateName', v_settings.template_name,
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', candidate.id,
          'externalId', candidate.external_id,
          'displayName', candidate.display_name,
          'profileUrl', candidate.profile_url,
          'attributes', candidate.attributes
        ) order by candidate.position)
        from public.estama_scout_candidates as candidate
        where candidate.batch_id = v_batch.id and candidate.status = 'approved'
      ), '[]'::jsonb)
    );
  end if;
  raise exception '未対応の処理です' using errcode = '22023';
end;
$$;
revoke all on function public.get_estama_scout_job(text, uuid, text) from public;
grant execute on function public.get_estama_scout_job(text, uuid, text) to anon, authenticated, service_role;

-- 集めた候補を保存して OK待ち にする（候補がいなければ empty）
create or replace function public.save_estama_scout_candidates(p_run_token text, p_batch_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := private.estama_scout_run_store(p_run_token);
  v_batch public.estama_scout_batches;
  v_item jsonb;
  v_position integer := 0;
  v_count integer;
begin
  if v_store_id is null then
    raise exception '実行トークンが無効です' using errcode = '42501';
  end if;
  select * into v_batch from public.estama_scout_batches
  where id = p_batch_id and store_id = v_store_id
  for update;
  if v_batch.id is null or v_batch.status <> 'collecting' then
    raise exception 'このスカウトは候補を集める段階ではありません' using errcode = '22023';
  end if;

  delete from public.estama_scout_candidates where batch_id = v_batch.id;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'candidates', '[]'::jsonb)) loop
    exit when v_position >= 30;
    continue when nullif(btrim(v_item ->> 'externalId'), '') is null;
    v_position := v_position + 1;
    insert into public.estama_scout_candidates (
      batch_id, store_id, position, external_id, display_name, summary, profile_url, attributes
    ) values (
      v_batch.id, v_store_id, v_position,
      left(btrim(v_item ->> 'externalId'), 200),
      left(v_item ->> 'displayName', 100),
      left(v_item ->> 'summary', 1000),
      left(v_item ->> 'profileUrl', 500),
      coalesce(v_item -> 'attributes', '{}'::jsonb)
    )
    on conflict (batch_id, external_id) do nothing;
  end loop;

  select count(*) into v_count from public.estama_scout_candidates where batch_id = v_batch.id;
  update public.estama_scout_batches
  set status = case when v_count > 0 then 'pending_approval' else 'empty' end,
      candidate_count = v_count,
      scout_url = left(p_payload ->> 'scoutUrl', 500),
      remaining_before = case when (p_payload ->> 'remaining') ~ '^\d+$' then (p_payload ->> 'remaining')::integer end,
      diagnostics = coalesce(p_payload -> 'diagnostics', '{}'::jsonb),
      finished_at = case when v_count > 0 then null else now() end,
      updated_at = now()
  where id = v_batch.id;
  return jsonb_build_object('candidates', v_count);
end;
$$;
revoke all on function public.save_estama_scout_candidates(text, uuid, jsonb) from public;
grant execute on function public.save_estama_scout_candidates(text, uuid, jsonb) to anon, authenticated, service_role;

-- 送信ボタンを押す直前に記録する（以後に止まったら uncertain 扱いで再送しない）
create or replace function public.mark_estama_scout_sending(p_run_token text, p_candidate_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := private.estama_scout_run_store(p_run_token);
  v_rows integer;
begin
  if v_store_id is null then
    raise exception '実行トークンが無効です' using errcode = '42501';
  end if;
  update public.estama_scout_candidates as candidate
  set status = 'sending', click_started_at = now(), updated_at = now()
  from public.estama_scout_batches as batch
  where candidate.id = p_candidate_id
    and candidate.store_id = v_store_id
    and candidate.status = 'approved'
    and batch.id = candidate.batch_id
    and batch.status = 'sending';
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.estama_scout_batches as batch
    set updated_at = now()
    from public.estama_scout_candidates as candidate
    where candidate.id = p_candidate_id and batch.id = candidate.batch_id;
  end if;
  return v_rows = 1;
end;
$$;
revoke all on function public.mark_estama_scout_sending(text, uuid) from public;
grant execute on function public.mark_estama_scout_sending(text, uuid) to anon, authenticated, service_role;

-- 1人分の結果
create or replace function public.save_estama_scout_result(
  p_run_token text,
  p_candidate_id uuid,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := private.estama_scout_run_store(p_run_token);
  v_rows integer;
begin
  if v_store_id is null then
    raise exception '実行トークンが無効です' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'uncertain') then
    raise exception '結果の種類が正しくありません' using errcode = '22023';
  end if;
  update public.estama_scout_candidates
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      error_message = left(p_error, 1000),
      updated_at = now()
  where id = p_candidate_id
    and store_id = v_store_id
    and (
      (status = 'sending' and p_status in ('sent', 'uncertain', 'failed'))
      or (status = 'approved' and p_status = 'failed')
    );
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.save_estama_scout_result(text, uuid, text, text) from public;
grant execute on function public.save_estama_scout_result(text, uuid, text, text) to anon, authenticated, service_role;

-- まとまりを終える（送信の完了・候補集めの失敗）
create or replace function public.finish_estama_scout_batch(
  p_run_token text,
  p_batch_id uuid,
  p_status text,
  p_error text default null,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := private.estama_scout_run_store(p_run_token);
  v_rows integer;
begin
  if v_store_id is null then
    raise exception '実行トークンが無効です' using errcode = '42501';
  end if;
  if p_status not in ('done', 'failed', 'continue') then
    raise exception '終わり方の種類が正しくありません' using errcode = '22023';
  end if;
  -- 時間切れで残りがある：次の5分ごとの処理で続きを送る
  if p_status = 'continue' then
    update public.estama_scout_batches
    set status = 'approved', updated_at = now()
    where id = p_batch_id and store_id = v_store_id and status = 'sending'
      and exists (select 1 from public.estama_scout_candidates c where c.batch_id = p_batch_id and c.status = 'approved');
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      return true;
    end if;
    p_status := 'done';
  end if;
  -- 送信中に止まったら、まだ押していない人は failed（送っていない）にする
  update public.estama_scout_candidates
  set status = 'failed',
      error_message = coalesce(error_message, left(coalesce(p_error, '送信を止めたため送っていません'), 1000)),
      updated_at = now()
  where batch_id = p_batch_id and store_id = v_store_id and status = 'approved';
  update public.estama_scout_candidates
  set status = 'uncertain',
      error_message = coalesce(error_message, '送信ボタンを押した後の結果を確認できませんでした'),
      updated_at = now()
  where batch_id = p_batch_id and store_id = v_store_id and status = 'sending';

  update public.estama_scout_batches as batch
  set status = case
        when batch.status = 'collecting' then 'failed'
        when p_status = 'failed' and not exists (
          select 1 from public.estama_scout_candidates c where c.batch_id = batch.id and c.status in ('sent', 'uncertain')
        ) then 'failed'
        else 'done'
      end,
      error_message = left(p_error, 1000),
      remaining_after = case when (p_payload ->> 'remaining') ~ '^\d+$' then (p_payload ->> 'remaining')::integer else batch.remaining_after end,
      diagnostics = case when p_payload ? 'diagnostics' then p_payload -> 'diagnostics' else batch.diagnostics end,
      sent_count = (select count(*) from public.estama_scout_candidates c where c.batch_id = batch.id and c.status = 'sent'),
      failed_count = (select count(*) from public.estama_scout_candidates c where c.batch_id = batch.id and c.status in ('failed', 'uncertain')),
      finished_at = now(),
      updated_at = now()
  where batch.id = p_batch_id
    and batch.store_id = v_store_id
    and batch.status in ('collecting', 'sending');
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.finish_estama_scout_batch(text, uuid, text, text, jsonb) from public;
grant execute on function public.finish_estama_scout_batch(text, uuid, text, text, jsonb) to anon, authenticated, service_role;

-- ── スマホ通知（OK待ちになった・送り終わった） ───────────────────────
create or replace function public.trg_estama_scout_push()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.status is not distinct from old.status
     or new.status not in ('pending_approval', 'done', 'failed') then
    return new;
  end if;
  if not exists (
    select 1 from public.push_subscriptions s
    where 'estama_scout' = any (s.topics) and s.store_id = new.store_id
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
    body := jsonb_build_object('event', 'estama_scout', 'id', new.id)
  );
  return new;
exception when others then
  raise warning 'estama scout push skipped: %', sqlerrm;
  return new;
end;
$function$;

create trigger estama_scout_batches_push after update of status on public.estama_scout_batches
  for each row execute function public.trg_estama_scout_push();

-- 既に通知を受け取っている端末にもスカウトの通知を足す（設定画面で個別にオフにできる）
alter table public.push_subscriptions
  alter column topics set default array['web_booking', 'sms_reply', 'sms_balance', 'estama_scout'];
update public.push_subscriptions
set topics = array_append(topics, 'estama_scout')
where not ('estama_scout' = any (topics));

-- ── 5分ごとの実行 ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'estama-scout-every-5-minutes') then
    perform cron.unschedule('estama-scout-every-5-minutes');
  end if;
  perform cron.schedule(
    'estama-scout-every-5-minutes',
    '2-57/5 * * * *',
    $job$select private.dispatch_estama_scout();$job$
  );
end;
$$;
