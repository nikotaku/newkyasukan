-- WEB予約受付の「メールですぐ取り込む」：Gmail の Apps Script 用のトークンを画面で発行し、取り込みの状況を見る。
-- トークンはその場で1回だけ返し、本体は保存しない（SHA-256 だけ）。チャットやリポジトリを通さずにスクリプトへ入れる。

create or replace function public.create_report_ingest_token(p_store_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
begin
  if auth.uid() is null or p_store_id is null or not public.can_manage_store(p_store_id) then
    raise exception 'この店舗を管理する権限がありません' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.report_ingest_tokens (store_id, token_hash, label)
  values (p_store_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), 'Gmail Apps Script（WEB予約受付から発行）');
  return v_token;
end;
$function$;

revoke all on function public.create_report_ingest_token(uuid) from public, anon;
grant execute on function public.create_report_ingest_token(uuid) to authenticated;

-- 取り込みの状況（スクリプトが最後に送ってきた時刻・最後のエステ魂の仮予約のメール）
create or replace function public.get_report_ingest_status(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or p_store_id is null or not public.can_manage_store(p_store_id) then
    raise exception 'この店舗を管理する権限がありません' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'last_used_at', (select max(last_used_at) from public.report_ingest_tokens where store_id = p_store_id),
    'last_message_at', (select max(created_at) from public.report_email_messages where store_id = p_store_id),
    'last_reservation_mail_at', (select max(received_at) from public.report_email_messages
      where store_id = p_store_id and kind = 'estama_reservation'),
    'messages', (select count(*) from public.report_email_messages where store_id = p_store_id)
  );
end;
$function$;

revoke all on function public.get_report_ingest_status(uuid) from public, anon;
grant execute on function public.get_report_ingest_status(uuid) to authenticated;
