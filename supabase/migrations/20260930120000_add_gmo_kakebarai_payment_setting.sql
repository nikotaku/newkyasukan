-- GMO掛け払いを決済方法として登録し、管理画面からアカウント情報と利用状況を管理できるようにする。
alter table public.payment_settings
  add column if not exists account_id text,
  add column if not exists account_password text,
  add column if not exists account_note text,
  add column if not exists status text not null default '通常利用';

alter table public.payment_settings
  drop constraint if exists payment_settings_status_check;

alter table public.payment_settings
  add constraint payment_settings_status_check
  check (status in ('通常利用', '限度額まで使用'));

insert into public.payment_settings (payment_method, payment_link, fee_percentage, status)
values ('GMO掛け払い', '', 0, '通常利用')
on conflict (payment_method) do nothing;

comment on column public.payment_settings.account_id is '決済サービスのアカウントID（GMO掛け払い等）';
comment on column public.payment_settings.account_password is '決済サービスのアカウントパスワード（GMO掛け払い等）';
comment on column public.payment_settings.account_note is '契約者番号など決済サービスの補足情報';
comment on column public.payment_settings.status is '決済方法の利用状況';
