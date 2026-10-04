-- ルームの暗証番号・入室方法・Wi-Fi などを、ログインしていない人（公開鍵だけ）から読めないようにする。
-- セラピストのマイページは RPC get_therapist_entry_rooms（トークンで本人確認）で読むので、表を直接読む必要はない。
-- 公開しても困らない列だけ、これまでどおり読めるようにしておく。
-- （マイページを RPC に切り替えたフロントのデプロイ後に適用する）
revoke select on public.rooms from anon;
grant select (
  id, name, display_name, description, capacity, amenities, room_photos, room_type,
  address, access, map_address, map_url, caution_text, sms_landmark, customer_guide_steps,
  is_active, store_id, created_at, updated_at
) on public.rooms to anon;
