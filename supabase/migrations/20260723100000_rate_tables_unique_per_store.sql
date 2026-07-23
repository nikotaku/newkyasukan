-- 料金マスタのユニーク制約を「全店共通」から「店舗ごと」に変更（マルチテナント対応）。
-- 艶華の指名料・オプション等が全力エステと衝突しないようにするため。
alter table public.back_rates drop constraint if exists back_rates_course_type_duration_key;
alter table public.back_rates add constraint back_rates_store_course_duration_key unique (store_id, course_type, duration);

alter table public.option_rates drop constraint if exists option_rates_option_name_key;
alter table public.option_rates add constraint option_rates_store_option_name_key unique (store_id, option_name);

alter table public.nomination_rates drop constraint if exists nomination_rates_nomination_type_key;
alter table public.nomination_rates add constraint nomination_rates_store_nomination_type_key unique (store_id, nomination_type);
