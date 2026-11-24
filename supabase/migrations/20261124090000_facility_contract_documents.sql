-- 契約管理（/facilities/contracts）：契約書のファイルを契約ごとに何枚でも付けられるようにする。
-- ファイルは非公開バケット contract-documents の <store_id>/<contract_id>/…。一覧は facility_contracts.documents（[{ path, name, size, type, uploaded_at }]）。
-- ログイン中のスタッフが自分の店舗の分だけ 見る・上げる・消す（ストレージのポリシー）。ログインしていない人からは表も読めない。

alter table public.facility_contracts add column if not exists documents jsonb not null default '[]'::jsonb;

revoke all on public.facility_contracts from anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('contract-documents', 'contract-documents', false, 20971520)
on conflict (id) do nothing;

create policy contract_documents_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'contract-documents' and (storage.foldername(name))[1] in (select public.current_store_ids()::text));
create policy contract_documents_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-documents' and (storage.foldername(name))[1] in (select public.current_store_ids()::text));
create policy contract_documents_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contract-documents' and (storage.foldername(name))[1] in (select public.current_store_ids()::text));
