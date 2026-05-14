insert into storage.buckets (id, name, public) values ('knowledge-images', 'knowledge-images', true) on conflict do nothing;

create policy "knowledge-images public read" on storage.objects for select using (bucket_id = 'knowledge-images');
create policy "knowledge-images auth upload" on storage.objects for insert to authenticated with check (bucket_id = 'knowledge-images');
create policy "knowledge-images auth delete" on storage.objects for delete to authenticated using (bucket_id = 'knowledge-images');
