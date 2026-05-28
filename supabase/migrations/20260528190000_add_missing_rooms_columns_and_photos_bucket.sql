-- FacilitiesRooms (設備・備品・衣装管理) 用カラム
alter table public.rooms add column if not exists room_type text;
alter table public.rooms add column if not exists entry_flow text;
alter table public.rooms add column if not exists key_info text;

-- RoomSettings 用カラム
alter table public.rooms add column if not exists equipment_costumes text;
alter table public.rooms add column if not exists garbage_disposal text;
alter table public.rooms add column if not exists equipment_placement text;

-- ルーム写真用ストレージバケット
insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do nothing;

create policy "Room photos are publicly accessible"
on storage.objects for select
using (bucket_id = 'room-photos');

create policy "Authenticated users can upload room photos"
on storage.objects for insert
with check (bucket_id = 'room-photos' and auth.role() = 'authenticated');

create policy "Authenticated users can update room photos"
on storage.objects for update
using (bucket_id = 'room-photos' and auth.role() = 'authenticated');

create policy "Authenticated users can delete room photos"
on storage.objects for delete
using (bucket_id = 'room-photos' and auth.role() = 'authenticated');
