-- PW管理（/knowledge/passwords）：バックアップキー・登録電話番号の欄を足す。
-- あわせて、ログイン情報の表をログインしていない人（公開サイトの鍵）から読めないようにする
-- （business_logins に anon も読み書きできる open_all_logins が付いていた）。

alter table public.password_entries
  add column if not exists backup_code text,
  add column if not exists phone text;

revoke all on public.password_entries from anon;
revoke all on public.business_logins from anon;

drop policy if exists open_all_logins on public.business_logins;
create policy business_logins_authenticated on public.business_logins
  for all to authenticated using (true) with check (true);
