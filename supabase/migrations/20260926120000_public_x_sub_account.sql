-- 公開サイト（anon）は casts を列単位の権限で読める列に絞っている。
-- 9/14 に追加した x_sub_account / x_sub_account_visible には権限がなく、公開セラピスト詳細ページの
-- 取得が permission denied になって「セラピスト情報が見つかりません」と表示されていた。
-- 非表示にしたサブ垢URLまで公開しないよう、HP表示オンのときだけ値が入る列を用意してそれだけを公開する。
alter table public.casts
  add column if not exists x_sub_account_public text
  generated always as (case when x_sub_account_visible then x_sub_account end) stored;

comment on column public.casts.x_sub_account_public is '公開HPに表示するXサブアカウントURL（HP表示オンのときのみ）';

grant select (x_sub_account_public) on table public.casts to anon, authenticated;
