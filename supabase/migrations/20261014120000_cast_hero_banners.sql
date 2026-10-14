-- トップページのトップバナーを、セラピストごとの素材から毎日自動で作ってローテーションする。
--   素材：casts.banner_images（バナー用の写真。何枚でも）・banner_copy（キャッチコピー）・banner_enabled（出す／出さない）
--         スタッフ画面のセラピスト編集「トップバナーの素材」で登録する
--   作り方：その営業日に出勤するセラピストのうち素材がある人のバナーを、画面側でその場で組み立てる
--         （写真・名前・キャッチコピー・本日の出勤・最短の空き。src/lib/castHeroBanners.ts / CastHeroBanner）
--   並び順：新人を先に、あとは日付で毎日先頭が入れ替わる。写真は日ごとに順番に替わる
--   店舗の stores.settings.cast_hero_banners = false で止められる
--   バナーに出た日は「露出ノルマ」の HPトップバナー（promotion_exposures）に自動で記録する

alter table public.casts add column if not exists banner_images text[] not null default '{}';
alter table public.casts add column if not exists banner_copy text;
alter table public.casts add column if not exists banner_enabled boolean not null default true;

comment on column public.casts.banner_images is 'トップバナー用の写真（何枚でも。日ごとに順番に使う）';
comment on column public.casts.banner_copy is 'トップバナーのキャッチコピー（30文字くらいまで）';
comment on column public.casts.banner_enabled is 'トップバナーに出すか';

-- 公開HPが読む（casts は列ごとに anon へ許可している）
grant select (banner_images, banner_copy, banner_enabled) on public.casts to anon;

-- その日バナーに出た人を露出ノルマ（HPトップバナー）に記録する。営業日が始まった後（朝6時台）に1日1回
create or replace function private.record_cast_hero_banner_exposures()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo' - interval '6 hours')::date;
  v_count integer;
begin
  insert into public.promotion_exposures (store_id, cast_id, channel_key, exposed_on, note)
  select distinct c.store_id, c.id, 'hp_top_banner', v_today, '自動：トップバナー（セラピストのバナー）'
  from public.casts c
  join public.stores s on s.id = c.store_id
  join public.shifts sh on sh.cast_id = c.id and sh.shift_date = v_today
  where c.is_active and c.is_visible and c.banner_enabled
    and cardinality(c.banner_images) > 0
    and coalesce(s.settings ->> 'cast_hero_banners', 'true') <> 'false'
    and coalesce(sh.approval_status, '') <> 'rejected'
    and coalesce(sh.status, '') not in ('cancelled', 'canceled', 'absent')
    and not exists (
      select 1 from public.promotion_exposures e
      where e.cast_id = c.id and e.channel_key = 'hp_top_banner' and e.exposed_on = v_today
    );
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function private.record_cast_hero_banner_exposures() from public, anon, authenticated;

-- 毎日 6:20（日本時間）＝ 21:20 UTC
select cron.unschedule(jobid) from cron.job where jobname = 'cast-hero-banner-exposures';
select cron.schedule('cast-hero-banner-exposures', '20 21 * * *', $$select private.record_cast_hero_banner_exposures()$$);
