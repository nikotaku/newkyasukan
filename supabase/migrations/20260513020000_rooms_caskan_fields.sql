-- Add キャスカン-compatible fields to rooms table
alter table public.rooms
  add column if not exists display_name   text,
  add column if not exists sms_text       text,
  add column if not exists email_text     text,
  add column if not exists access         text,
  add column if not exists map_address    text,
  add column if not exists map_url        text,
  add column if not exists cast_guide     text,
  add column if not exists internal_notes text;

-- Upsert インルーム from キャスカン data
insert into public.rooms
  (name, display_name, address, access, map_address, map_url,
   sms_text, email_text, room_photos, is_active, capacity)
values (
  'インルーム',
  '■二日町インroom■',
  '仙台市 青葉区 二日町11-15 In-Towner 201号室',
  '⚫️地下鉄南北線/北四番丁駅 徒歩5分',
  '仙台市青葉区二日町11',
  'https://x.gd/nf3ip',
  E'【住所】\n仙台市 青葉区 二日町11-15 \nIn-Towner 201号室\n\n※1階にある炭火焼き鳥四代目『はしもとや』が目印です。\n\n▼Googleマップ\nhttps://x.gd/nf3ip',
  E'【住所】\n仙台市 青葉区 二日町11-15 \nIn-Towner 201号室\n\n※1階にある炭火焼き鳥四代目『はしもとや』が目印です。\n\n▼Googleマップ\nhttps://x.gd/nf3ip',
  ARRAY['https://cdn2-caskan.com/caskan/img/room/room_1401_17594737392670194.jpeg']::text[],
  true,
  1
)
on conflict (name) do update set
  display_name   = excluded.display_name,
  address        = excluded.address,
  access         = excluded.access,
  map_address    = excluded.map_address,
  map_url        = excluded.map_url,
  sms_text       = excluded.sms_text,
  email_text     = excluded.email_text,
  room_photos    = excluded.room_photos,
  is_active      = excluded.is_active;

-- Ensure ラズルーム row exists (data TBD)
insert into public.rooms (name, display_name, is_active, capacity)
values ('ラズルーム', 'ラズルーム', true, 1)
on conflict (name) do nothing;

notify pgrst, 'reload schema';
