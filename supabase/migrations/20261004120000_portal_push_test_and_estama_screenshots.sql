-- 1) セラピストのマイページを「ホーム画面に追加」して、テスト通知まで届いたかを記録する。
--    管理画面の「SNS・媒体登録の完了状況」に出す（ホーム画面から通知をオンにした端末があるか・テスト通知を受け取ったか）。
-- 2) エスたまの同期作業（プロフィール・シフト・日記・照合）ごとに、作業が終わった画面のスクリーンショットを残す。
--    非公開バケット estama-job-screenshots の <store_id>/<job_id>.jpg。エスたま自動化の履歴から見られる。

-- ── 1) マイページのホーム画面追加・テスト通知 ─────────────────────────
alter table public.therapist_push_subscriptions
  add column if not exists standalone boolean not null default false,
  add column if not exists test_sent_at timestamptz,
  add column if not exists test_confirmed_at timestamptz;

-- これまでの登録は端末名（「iPhone・ホーム画面」など）から判断する
update public.therapist_push_subscriptions
set standalone = true
where device_label like '%ホーム画面%' and not standalone;

-- ホーム画面に追加したアプリから通知をオンにした（save_therapist_push_subscription のあとに呼ぶ）
create or replace function public.mark_therapist_push_standalone(p_token text, p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.therapist_push_subscriptions as subscription
  set standalone = true, updated_at = now()
  from public.casts as cast_record
  where subscription.endpoint = p_endpoint
    and cast_record.id = subscription.cast_id
    and cast_record.access_token = p_token
    and coalesce(p_token, '') <> '';
  return found;
end;
$$;
revoke all on function public.mark_therapist_push_standalone(text, text) from public;
grant execute on function public.mark_therapist_push_standalone(text, text) to anon, authenticated;

-- テスト通知が届いた（通知をタップした・「届いた」を押した）
create or replace function public.confirm_therapist_push_test(p_token text, p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.therapist_push_subscriptions as subscription
  set test_confirmed_at = now(), updated_at = now()
  from public.casts as cast_record
  where subscription.endpoint = p_endpoint
    and cast_record.id = subscription.cast_id
    and cast_record.access_token = p_token
    and coalesce(p_token, '') <> '';
  return found;
end;
$$;
revoke all on function public.confirm_therapist_push_test(text, text) from public;
grant execute on function public.confirm_therapist_push_test(text, text) to anon, authenticated;

create or replace function public.get_therapist_push_status(p_token text, p_endpoint text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'devices', count(subscription.id),
    'this_device', coalesce(bool_or(subscription.endpoint = p_endpoint), false),
    'this_device_standalone', coalesce(bool_or(subscription.endpoint = p_endpoint and subscription.standalone), false),
    'this_device_test_confirmed', coalesce(bool_or(subscription.endpoint = p_endpoint and subscription.test_confirmed_at is not null), false),
    'setup_complete', coalesce(bool_or(subscription.standalone and subscription.test_confirmed_at is not null), false)
  )
  from public.casts as cast_record
  left join public.therapist_push_subscriptions as subscription on subscription.cast_id = cast_record.id
  where cast_record.access_token = p_token and coalesce(p_token, '') <> '';
$$;
revoke all on function public.get_therapist_push_status(text, text) from public;
grant execute on function public.get_therapist_push_status(text, text) to anon, authenticated;

-- ── 2) エスたまの同期作業のスクリーンショット ─────────────────────────
alter table public.automation_jobs
  add column if not exists screenshot_path text,
  add column if not exists screenshot_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estama-job-screenshots', 'estama-job-screenshots', false, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- パスの先頭（店舗ID）の店舗を管理できる人だけ
create or replace function public.can_access_estama_job_screenshot(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_manage_store(v_folder::uuid);
end;
$$;
revoke all on function public.can_access_estama_job_screenshot(text) from public, anon;
grant execute on function public.can_access_estama_job_screenshot(text) to authenticated;

create policy estama_job_screenshots_select on storage.objects for select to authenticated
  using (bucket_id = 'estama-job-screenshots' and public.can_access_estama_job_screenshot(name));
create policy estama_job_screenshots_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'estama-job-screenshots' and public.can_access_estama_job_screenshot(name));
create policy estama_job_screenshots_update on storage.objects for update to authenticated
  using (bucket_id = 'estama-job-screenshots' and public.can_access_estama_job_screenshot(name))
  with check (bucket_id = 'estama-job-screenshots' and public.can_access_estama_job_screenshot(name));
-- 30日より古いスクリーンショットをワーカーが消す（管理画面からの実行はログイン中のスタッフの権限）
create policy estama_job_screenshots_delete on storage.objects for delete to authenticated
  using (bucket_id = 'estama-job-screenshots' and public.can_access_estama_job_screenshot(name));
