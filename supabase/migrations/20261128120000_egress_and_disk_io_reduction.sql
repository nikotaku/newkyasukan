-- Cached Egress（画像転送量）と Disk IO（DB の書き込み・走査回数）を減らす。
-- 2026-11-28 / Supabase 無料枠（Cached Egress 5.5GB 超過予告・Disk IO 枯渇警告）への対策。
--
-- 中身（すべて冪等・何度実行しても同じ結果）:
--   1. 日付での検索に索引を足す（reservations / shifts / automation_runner_runs / 期限切れニュース）
--   2. get_reservation_slots に店舗の条件を足す（今までは全店舗の予約を日付で全走査していた）
--   3. pg_cron の実行記録（cron.job_run_details）と HTTP の応答（net._http_response）の定期削除
--   4. 30秒・毎分ジョブの頻度見直し（業務に支障のない範囲）
--   5. 既存 Storage オブジェクトのキャッシュを1年へ（新規アップロードはアプリ側で cacheControl 31536000）
--
-- 画像の転送量そのものは、HP が /api/img（Vercel の関数 + CDN）経由で画面に合った幅の WebP/JPEG を読むことで減らす
-- （Supabase の無料プランでは画像変換が使えないため。原本は Storage にそのまま残す）。

-- ── 1. 索引 ────────────────────────────────────────────────────────────────
-- 空き枠（トップ・予約ページを開くたびに reservation_date で引く）
create index if not exists reservations_store_date_idx on public.reservations (store_id, reservation_date);
create index if not exists reservations_date_cast_idx on public.reservations (reservation_date, cast_id);

-- 出勤（公開ページは shift_date + store_id で読む）
create index if not exists shifts_store_date_idx on public.shifts (store_id, shift_date);
create index if not exists shifts_date_idx on public.shifts (shift_date);

-- 自動化のかんばん（毎分 status='running' を走査している）
create index if not exists automation_runner_runs_running_idx
  on public.automation_runner_runs (status, heartbeat_at) where status = 'running';

-- 5分ごとのニュース期限切れ処理（hp_articles × pr_desk_history の結合）
create index if not exists pr_desk_history_created_idx on public.pr_desk_history (created_at);
create index if not exists hp_articles_published_idx on public.hp_articles (store_id, is_published, updated_at);

-- ── 2. 空き枠の問い合わせ（店舗の条件を足す） ────────────────────────────────
-- 戻り（id, cast_id, reservation_date, start_time, duration）と、無料サービスの分を足す計算は今まで通り。
-- 呼び出し側（公開ページ・O2の投稿）は p_store_id を渡す。古い呼び出し（2つだけ）も p_store_id = null で動く。
drop function if exists public.get_reservation_slots(date, uuid);
create or replace function public.get_reservation_slots(
  p_date date,
  p_cast_id uuid default null,
  p_store_id uuid default null
)
returns table(id uuid, cast_id uuid, reservation_date date, start_time time without time zone, duration integer)
language sql stable security definer set search_path = 'public' as $function$
  select id, cast_id, reservation_date, start_time, duration + coalesce(free_service_minutes, 0)
  from public.reservations
  where reservation_date = p_date
    and (p_cast_id is null or cast_id = p_cast_id)
    and (p_store_id is null or store_id = p_store_id)
    and status not in ('cancelled', 'hold');
$function$;
grant execute on function public.get_reservation_slots(date, uuid, uuid) to anon, authenticated;

-- ── 3. ログの定期削除（たまり続けると DB 容量と autovacuum を食う） ──────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'perf-cleanup-logs') then
    perform cron.unschedule('perf-cleanup-logs');
  end if;
  perform cron.schedule(
    'perf-cleanup-logs',
    '30 3 * * *',
    $job$
      delete from cron.job_run_details where end_time < now() - interval '7 days';
      delete from net._http_response    where created  < now() - interval '3 days';
      delete from public.automation_runner_runs where started_at < now() - interval '90 days';
    $job$
  );
end;
$$;

-- ── 4. ジョブの頻度見直し ─────────────────────────────────────────────────
-- セラピストへの通知：30秒 → 60秒（体感は変わらない。実行回数が半分になる）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'therapist-notify-every-30-seconds') then
    perform cron.unschedule('therapist-notify-every-30-seconds');
  end if;
  if not exists (select 1 from cron.job where jobname = 'therapist-notify-every-minute') then
    perform cron.schedule(
      'therapist-notify-every-minute',
      '* * * * *',
      $job$select private.dispatch_therapist_notifications();$job$
    );
  end if;
end;
$$;

-- ニュースの期限切れ（24時間で非公開にする）：毎分 → 5分ごと（最大5分遅れるだけ）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pr-news-expire') then
    perform cron.unschedule('pr-news-expire');
  end if;
  perform cron.schedule('pr-news-expire', '*/5 * * * *', $job$
    update public.hp_articles as article
    set is_published = false
    from public.pr_desk_history as history
    where article.id = history.article_id
      and article.store_id = history.store_id
      and history.kind in ('news', 'news_attendance', 'news_intro', 'news_coupon')
      and article.is_published
      and history.created_at <= now() - interval '24 hours';
  $job$);
end;
$$;

-- ── 5. 既存 Storage オブジェクトのキャッシュを1年へ ─────────────────────────
-- ファイル名は UUID で変わらない（加工すると別ファイルになる）ので、1年持たせてよい。
-- 新しいアップロードはアプリ側が cacheControl: '31536000' を付けて置く。
update storage.objects
set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{cacheControl}', '"31536000"')
where bucket_id in ('cast-photos', 'banner-images', 'article-images', 'knowledge-images')
  and coalesce(metadata->>'cacheControl', '') <> '31536000';
