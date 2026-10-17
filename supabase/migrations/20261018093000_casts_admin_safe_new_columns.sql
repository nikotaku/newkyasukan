-- スタッフ画面のセラピスト編集は casts_admin_safe（access_token・O2のパスワードを除いたビュー）から読む。
-- 後から足した列がビューに無かったため、編集画面で「新規のお客様のコース上限」やバナーの素材が空に見え、
-- 保存すると上限が消えていた。後ろに足す（既存の列の並びは変えない）。

create or replace view public.casts_admin_safe with (security_invoker = true) as
select id, name, type, status, photo, profile, room, photos, x_account, hp_notice, upload_check,
  execution_date_start, execution_date_end, join_date, is_active, created_at, updated_at, real_name,
  line_url, litlink_url, o2_url, is_visible, age, height, cup_size, message, tags, bust, waist, hip,
  blood_type, therapist_years, favorite_techniques, favorite_food, celebrity_lookalike, day_off_activities,
  hobbies, ideal_type, display_order, romaji_name, dispatch_status, repeat_scheduled, ideal_partner,
  follow_list, media_registration, marks, files, registration_sheet, format_type, recent_dispatch_details,
  memo, is_online, name_kana, name_en, weight, bust_size, shop_comment, therapist_comment, features,
  therapist_experience, hometown, birth_date, body_size, enrollment_period, hobby, celebrity_like, uses_sns,
  blog_url, skebiy_url, instagram_url, custom_fields, customer_base_memo, referral_route, interview_sheet_url,
  referral_reward_id, total_points, profile_format, management_photos, ranking_cast_id, store_id,
  line_group_id, title_badge_id, o2_login_url, o2_login_email, o2_login_id, estama_listed, esuran_listed,
  estama_profile_url, estama_auto_register, o2_created, o2_linkage_requested, x_created, x_list_added,
  x_ff_completed, self_intro_tweeted, cast_kind,
  -- ここから追加
  is_estama_dummy, x_sub_account, x_sub_account_visible, x_sub_account_public,
  new_customer_max_minutes, banner_images, banner_copy, banner_enabled
from public.casts;

revoke all on public.casts_admin_safe from public, anon;
grant select on public.casts_admin_safe to authenticated;
