-- 店舗ごとの独自ドメイン（apex/wwwなし表記で保存）
alter table public.stores add column if not exists custom_domain text;
create unique index if not exists stores_custom_domain_idx
  on public.stores (custom_domain) where custom_domain is not null;
