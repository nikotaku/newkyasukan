alter table public.facility_contracts
  add column if not exists tags text[] not null default '{}';

-- migrate existing contract_type to tags
update public.facility_contracts set tags =
  case contract_type
    when 'rental'    then ARRAY['賃貸']
    when 'utilities' then ARRAY['光熱費']
    when 'wifi'      then ARRAY['Wi-Fi・通信']
    when 'phone'     then ARRAY['Wi-Fi・通信']
    when 'suppliers' then ARRAY['取引先']
    else                  ARRAY['その他']
  end
where tags = '{}' or tags is null;

notify pgrst, 'reload schema';
