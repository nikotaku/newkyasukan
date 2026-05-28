-- Create storage bucket for therapist (cast) photos
insert into storage.buckets (id, name, public)
values ('cast-photos', 'cast-photos', true)
on conflict (id) do nothing;

-- Public read access
create policy "Cast photos are publicly accessible"
on storage.objects for select
using (bucket_id = 'cast-photos');

-- Authenticated users can upload
create policy "Authenticated users can upload cast photos"
on storage.objects for insert
with check (bucket_id = 'cast-photos' and auth.role() = 'authenticated');

-- Authenticated users can update
create policy "Authenticated users can update cast photos"
on storage.objects for update
using (bucket_id = 'cast-photos' and auth.role() = 'authenticated');

-- Authenticated users can delete
create policy "Authenticated users can delete cast photos"
on storage.objects for delete
using (bucket_id = 'cast-photos' and auth.role() = 'authenticated');
