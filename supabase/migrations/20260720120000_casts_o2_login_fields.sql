-- セラピストごとのO2（m-sns.net）ログイン情報。管理画面からワンクリックで共有文面をコピーする用途。
alter table public.casts add column if not exists o2_login_url text default 'https://m-sns.net/cast/login/';
alter table public.casts add column if not exists o2_login_email text;
alter table public.casts add column if not exists o2_login_id text;
alter table public.casts add column if not exists o2_login_password text;
