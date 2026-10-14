-- 宣伝の企画スケジュール（promotion_plan_tasks）の投稿タスクを、実際に投稿した記録から自動で「完了」にする。
-- 何で完了にしたかは auto_source（画面に「自動で確認：…」）と auto_url に残す。手で外したタスクは自動で付け直さない（auto_skip）。
-- 投稿日から3日過ぎても終わっていないタスクは expired_at を付けて「期限切れ」にまとめる（残りの数に入れない）。
--
-- 見る記録（その投稿日の営業日＝朝6時〜翌朝6時、企画のセラピストの名前が入っているもの）：
--   O2（本人）    … マイページの同時投稿（cast_posts の O2 が posted）
--   O2（店舗）    … 店長の投稿（manager_posts の O2）・O2の空き状況の自動投稿（o2_store_availability_posts の紹介）
--   X（店舗）     … X運用表で投稿したもの（x_daily_posts）
--   HPニュース    … 公開したHPのニュース（hp_articles）
--   エスたまニュース … HPのニュースがエステ魂にも載ったもの（hp_articles.estama_posted_at）
-- 本人のX・O2ストーリー・バナー・LINE公式は記録が無いので手でチェックする。

alter table public.promotion_plan_tasks add column if not exists auto_source text;
alter table public.promotion_plan_tasks add column if not exists auto_url text;
alter table public.promotion_plan_tasks add column if not exists auto_skip boolean not null default false;
alter table public.promotion_plan_tasks add column if not exists expired_at timestamptz;

comment on column public.promotion_plan_tasks.auto_source is '自動で完了にしたときの根拠（例：O2に投稿 10/3 21:05）';
comment on column public.promotion_plan_tasks.auto_skip is '手で未完了に戻したタスク。自動チェックで付け直さない';
comment on column public.promotion_plan_tasks.expired_at is '投稿日から3日過ぎても終わっていない（期限切れ）';

-- 手で未完了に戻したら、自動チェックで付け直さない
create or replace function public.promotion_task_manual_uncheck()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_completed and not new.is_completed then
    new.auto_skip := true;
    new.auto_source := null;
    new.auto_url := null;
  end if;
  if new.is_completed then
    new.expired_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_promotion_task_manual_uncheck on public.promotion_plan_tasks;
create trigger trg_promotion_task_manual_uncheck
  before update of is_completed on public.promotion_plan_tasks
  for each row execute function public.promotion_task_manual_uncheck();

-- タスクの種類（ラベルの頭と宣伝先から）
create or replace function private.promotion_task_kind(p_label text, p_channel text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when v.prefix ~ 'ストーリー' or p_channel = 'o2_story' then 'o2_story'
    when v.prefix ~ '(0|０|O|Ｏ)2' then case when v.prefix ~ '店舗' then 'store_o2' else 'self_o2' end
    when v.prefix ~ '[XＸ]' then case when v.prefix ~ '本人' then 'self_x' else 'store_x' end
    when coalesce(p_label, '') ~ '(エステ魂|エスたま|魂).{0,6}ニュース' then 'estama_news'
    when coalesce(p_label, '') ~ 'HP.{0,6}ニュース' or p_channel = 'hp_news' then 'hp_news'
    when p_channel = 'o2_post' then 'self_o2'
    when p_channel = 'x_post' then 'store_x'
    else 'manual'
  end
  from (select split_part(replace(coalesce(p_label, ''), '：', ':'), ':', 1) as prefix) v
$$;

-- 名前の照合用（絵文字・空白・記号を除く）
create or replace function private.promotion_norm(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select regexp_replace(normalize(coalesce(p, ''), NFKC), '[^[:alnum:]ぁ-んァ-ヶー一-龠々]', '', 'g')
$$;

-- 1つのタスクの根拠を探す（見つからなければ null）
create or replace function private.promotion_task_evidence(p_task public.promotion_plan_tasks)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_plan public.promotion_plans;
  v_kind text;
  v_from timestamptz;
  v_to timestamptz;
  v_names text[];
  v_cast_ids uuid[];
  v_hit record;
begin
  if p_task.task_type <> 'posting' or p_task.scheduled_on is null then return null; end if;
  select * into v_plan from public.promotion_plans where id = p_task.plan_id;
  if v_plan.id is null then return null; end if;
  v_kind := private.promotion_task_kind(p_task.label, p_task.channel_key);
  if v_kind in ('manual', 'self_x', 'o2_story') then return null; end if;

  v_from := (p_task.scheduled_on + time '06:00') at time zone 'Asia/Tokyo';
  v_to := v_from + interval '1 day';
  v_cast_ids := coalesce(v_plan.cast_ids, '{}');
  select coalesce(array_agg(private.promotion_norm(c.name)) filter (where length(private.promotion_norm(c.name)) >= 2), '{}')
  into v_names
  from public.casts c where c.id = any(v_cast_ids);
  -- 企画に名前しか無い（こよみ&れいな など）ときは、ラベルの名前で探す
  if coalesce(array_length(v_names, 1), 0) = 0 then
    select coalesce(array_agg(private.promotion_norm(n)) filter (where length(private.promotion_norm(n)) >= 2), '{}')
    into v_names
    from unnest(regexp_split_to_array(coalesce(v_plan.therapist_label, ''), '[&＆、,・\s]+')) n;
  end if;
  if coalesce(array_length(v_names, 1), 0) = 0 and coalesce(array_length(v_cast_ids, 1), 0) = 0 then return null; end if;

  if v_kind = 'self_o2' then
    select cp.posted_at as at, cp.o2_post_url as url into v_hit
    from public.cast_posts cp
    where cp.cast_id = any(v_cast_ids) and cp.o2_status = 'posted'
      and coalesce(cp.posted_at, cp.created_at) >= v_from and coalesce(cp.posted_at, cp.created_at) < v_to
    order by cp.posted_at limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', 'O2に投稿（マイページの同時投稿 ' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', v_hit.url, 'at', v_hit.at);
    end if;
    return null;
  end if;

  if v_kind = 'store_o2' then
    select coalesce(mp.o2_posted_at, mp.created_at) as at, mp.o2_post_url as url into v_hit
    from public.manager_posts mp
    where mp.store_id = p_task.store_id and mp.o2_status = 'posted'
      and coalesce(mp.o2_posted_at, mp.created_at) >= v_from and coalesce(mp.o2_posted_at, mp.created_at) < v_to
      and exists (select 1 from unnest(v_names) n where private.promotion_norm(mp.body) like '%' || n || '%')
    order by 1 limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', '店舗のO2に投稿（店長の投稿 ' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', v_hit.url, 'at', v_hit.at);
    end if;
    select coalesce(ap.posted_at, ap.created_at) as at, ap.o2_post_url as url into v_hit
    from public.o2_store_availability_posts ap
    where ap.store_id = p_task.store_id and ap.status = 'posted'
      and coalesce(ap.posted_at, ap.created_at) >= v_from and coalesce(ap.posted_at, ap.created_at) < v_to
      and (ap.featured_cast_id = any(v_cast_ids)
        or exists (select 1 from unnest(v_names) n where private.promotion_norm(ap.body) like '%' || n || '%'))
    order by 1 limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', '店舗のO2に投稿（空き状況の自動投稿 ' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', v_hit.url, 'at', v_hit.at);
    end if;
    return null;
  end if;

  if v_kind = 'store_x' then
    select coalesce(xp.posted_at, xp.updated_at) as at, xp.post_url as url into v_hit
    from public.x_daily_posts xp
    where xp.store_id = p_task.store_id
      and (xp.posted_at is not null or xp.publish_status = 'posted')
      and coalesce(xp.posted_at, xp.updated_at) >= v_from and coalesce(xp.posted_at, xp.updated_at) < v_to
      and exists (select 1 from unnest(v_names) n where private.promotion_norm(coalesce(xp.posted_text, xp.text)) like '%' || n || '%')
    order by 1 limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', '店舗のXに投稿（X運用表 ' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', v_hit.url, 'at', v_hit.at);
    end if;
    return null;
  end if;

  if v_kind = 'hp_news' then
    select a.created_at as at, a.slug as url into v_hit
    from public.hp_articles a
    where a.store_id = p_task.store_id and a.is_published
      and a.created_at >= v_from and a.created_at < v_to
      and exists (select 1 from unnest(v_names) n where private.promotion_norm(a.title || a.content) like '%' || n || '%')
    order by 1 limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', 'HPのニュースを公開（' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', null, 'at', v_hit.at);
    end if;
    return null;
  end if;

  if v_kind = 'estama_news' then
    select a.estama_posted_at as at, a.estama_news_url as url into v_hit
    from public.hp_articles a
    where a.store_id = p_task.store_id and a.estama_posted_at >= v_from and a.estama_posted_at < v_to
      and exists (select 1 from unnest(v_names) n where private.promotion_norm(a.title || a.content) like '%' || n || '%')
    order by 1 limit 1;
    if v_hit.at is not null then
      return jsonb_build_object('source', 'エステ魂のニュースに掲載（' || to_char(v_hit.at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') || '）', 'url', v_hit.url, 'at', v_hit.at);
    end if;
  end if;
  return null;
end
$$;

-- 自動チェックと期限切れ。返すのは（完了にした数, 期限切れにした数）
create or replace function private.auto_check_promotion_tasks(p_store_id uuid default null)
returns table(completed integer, expired integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo' - interval '6 hours')::date;
  v_task public.promotion_plan_tasks;
  v_evidence jsonb;
  v_completed integer := 0;
  v_expired integer := 0;
begin
  for v_task in
    select * from public.promotion_plan_tasks t
    where not t.is_completed and not t.auto_skip and t.task_type = 'posting'
      and t.scheduled_on is not null and t.scheduled_on <= v_today
      and (p_store_id is null or t.store_id = p_store_id)
  loop
    v_evidence := private.promotion_task_evidence(v_task);
    if v_evidence is not null then
      update public.promotion_plan_tasks
      set is_completed = true,
          completed_at = coalesce((v_evidence ->> 'at')::timestamptz, now()),
          completed_by = null,
          auto_source = v_evidence ->> 'source',
          auto_url = nullif(v_evidence ->> 'url', ''),
          expired_at = null,
          updated_at = now()
      where id = v_task.id and not is_completed;
      v_completed := v_completed + 1;
    end if;
  end loop;

  update public.promotion_plan_tasks t
  set expired_at = now(), updated_at = now()
  where not t.is_completed and t.expired_at is null and t.task_type = 'posting'
    and t.scheduled_on is not null and t.scheduled_on < v_today - 3
    and (p_store_id is null or t.store_id = p_store_id);
  get diagnostics v_expired = row_count;

  return query select v_completed, v_expired;
end
$$;

revoke all on function private.auto_check_promotion_tasks(uuid) from public, anon, authenticated;

-- 画面の「投稿を確認」から（ログイン中のスタッフ・所属店舗だけ）
create or replace function public.run_promotion_task_autocheck(p_store_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_result record;
begin
  if not exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = p_store_id) then
    raise exception 'この店舗の操作はできません';
  end if;
  select * into v_result from private.auto_check_promotion_tasks(p_store_id);
  return jsonb_build_object('completed', v_result.completed, 'expired', v_result.expired);
end
$$;

revoke all on function public.run_promotion_task_autocheck(uuid) from public, anon;
grant execute on function public.run_promotion_task_autocheck(uuid) to authenticated;

-- 15分ごと
select cron.unschedule(jobid) from cron.job where jobname = 'promotion-task-autocheck';
select cron.schedule('promotion-task-autocheck', '*/15 * * * *', $$select private.auto_check_promotion_tasks()$$);

-- 投稿文の下書き（画面の「投稿文を作る」でAIが作る。手直しして保存できる）
alter table public.promotion_plan_tasks add column if not exists draft_text text;
comment on column public.promotion_plan_tasks.draft_text is 'AIで作った投稿文の下書き（手直し可）';
