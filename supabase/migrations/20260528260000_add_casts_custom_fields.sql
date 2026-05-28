-- セラピスト管理情報を自由なプロパティで管理するためのカラム
alter table public.casts add column if not exists custom_fields jsonb not null default '{}'::jsonb;
