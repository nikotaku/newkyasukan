-- ナレッジ用の汎用ファイルバケット（PDF・画像・各種ドキュメント）
insert into storage.buckets (id, name, public) values ('knowledge-files', 'knowledge-files', true) on conflict do nothing;

create policy "knowledge-files public read" on storage.objects for select using (bucket_id = 'knowledge-files');
create policy "knowledge-files auth upload" on storage.objects for insert to authenticated with check (bucket_id = 'knowledge-files');
create policy "knowledge-files auth delete" on storage.objects for delete to authenticated using (bucket_id = 'knowledge-files');
