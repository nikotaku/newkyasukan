-- セラピストのマイページ「入室方法」：鍵の開け方のアニメーション・鍵の場所までの道順・Wi-Fi。
-- 暗証番号・Wi-Fi のパスワードはマイページのトークンで本人確認してから渡す（RPC get_therapist_entry_rooms）。
-- 実際の番号はこのファイルに書かず、ルーム管理（/facilities/rooms）から入れる。

alter table public.rooms
  -- keypad = ドアのテンキー（SwitchBot キーパッド）、dial_lock = ダイヤル式の鍵（キーボックス）
  add column if not exists key_type text check (key_type in ('keypad', 'dial_lock')),
  -- ダイヤル式の鍵を閉めるときに戻す番号
  add column if not exists key_close_code text,
  -- 鍵の場所までの道順 [{ image_url, video_url, text, focus: { x, y, zoom } }]（セラピスト向け。お客様向けは customer_guide_steps）
  add column if not exists entry_route_steps jsonb not null default '[]'::jsonb,
  add column if not exists wifi_ssid text,
  add column if not exists wifi_password text,
  add column if not exists wifi_security text not null default 'WPA' check (wifi_security in ('WPA', 'WEP', 'nopass')),
  -- マイページの「入室方法」に出すルーム
  add column if not exists show_in_therapist_portal boolean not null default false;

-- これまでマイページに出していたルーム
update public.rooms
set show_in_therapist_portal = true
where name in ('華月', '艶月') and not show_in_therapist_portal;

create or replace function public.get_therapist_entry_rooms(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', room.id,
    'name', room.name,
    'address', room.address,
    'entry_flow', room.entry_flow,
    'key_info', room.key_info,
    'key_number', room.key_number,
    'key_type', room.key_type,
    'key_close_code', room.key_close_code,
    'entry_photos', room.entry_photos,
    'entry_route_steps', room.entry_route_steps,
    'wifi_ssid', room.wifi_ssid,
    'wifi_password', room.wifi_password,
    'wifi_security', room.wifi_security
  ) order by room.name), '[]'::jsonb)
  from public.casts as cast_record
  join public.rooms as room on room.store_id = cast_record.store_id
  where cast_record.access_token = p_token
    and coalesce(p_token, '') <> ''
    -- 辞めた人のURLでは出さない
    and coalesce(cast_record.is_active, true)
    and room.is_active
    and room.show_in_therapist_portal;
$$;
revoke all on function public.get_therapist_entry_rooms(text) from public;
grant execute on function public.get_therapist_entry_rooms(text) to anon, authenticated;

-- 入室方法の写真・動画のバケット：表示は公開URLのまま、一覧・追加・削除はログイン中のスタッフだけ
-- （これまでは誰でも一覧・アップロード・削除ができた。公開バケットなので公開URLでの表示はポリシーに関係なく続く）
create policy "entry-photos staff manage" on storage.objects for all to authenticated
  using (bucket_id = 'entry-photos')
  with check (bucket_id = 'entry-photos');
alter policy "entry-photos all" on storage.objects to authenticated;
alter policy "entry-photos any upload" on storage.objects to authenticated;
alter policy "entry-photos any delete" on storage.objects to authenticated;
alter policy "entry-photos public read" on storage.objects to authenticated;
