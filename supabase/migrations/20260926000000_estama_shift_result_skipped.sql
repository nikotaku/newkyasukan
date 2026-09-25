-- エステ魂は2週間先までしか出勤を登録できない。期間外で保留した結果や、
-- エステ魂で非掲載のため削除不要だった結果（skipped=true）は、ジョブは完了にしつつ
-- 「エスたま同期済み」にはせず、セラピスト・連携のエラー表示も上書きしない。
create or replace function public.report_estama_shift_result(
  p_token text,
  p_job_id uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
  job_row public.automation_jobs%rowtype;
  result_ok boolean := false;
  result_skipped boolean := false;
  result_action text;
  error_text text;
  dummy_shift_id uuid;
begin
  if p_token is null or length(p_token) < 48 or p_job_id is null then
    return false;
  end if;

  update public.estama_sync_tokens
  set used_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and purpose = 'report:' || p_job_id::text
    and used_at is null
    and expires_at > now()
  returning id into claimed_id;

  if claimed_id is null then
    return false;
  end if;

  select *
  into job_row
  from public.automation_jobs
  where id = p_job_id
    and provider = 'estama'
    and job_type = 'estama_sync_shift';

  if not found then
    return false;
  end if;

  result_ok := coalesce((p_result ->> 'ok')::boolean, false);
  result_skipped := result_ok and coalesce(p_result ->> 'skipped', '') = 'true';
  result_action := coalesce(nullif(p_result ->> 'action', ''), 'upsert');
  error_text := nullif(left(coalesce(p_result ->> 'error', '同期に失敗しました'), 1000), '');

  update public.automation_jobs
  set status = case when result_ok then 'completed' else 'failed' end,
      result = case when result_ok then p_result else '{}'::jsonb end,
      error_message = case when result_ok then null else error_text end,
      finished_at = now()
  where id = p_job_id;

  if job_row.shift_id is not null then
    update public.shifts
    set estama_registered = result_ok and not result_skipped and result_action = 'upsert'
    where id = job_row.shift_id;
  end if;

  begin
    dummy_shift_id := nullif(job_row.payload ->> 'dummy_shift_id', '')::uuid;
  exception when invalid_text_representation then
    dummy_shift_id := null;
  end;

  if dummy_shift_id is not null then
    update public.estama_dummy_shifts
    set estama_registered = result_ok and not result_skipped and result_action = 'upsert'
    where id = dummy_shift_id;
  end if;

  if job_row.cast_id is not null and not result_skipped then
    update public.external_cast_profiles
    set last_shift_sync_at = case when result_ok then now() else last_shift_sync_at end,
        last_error = case when result_ok then null else error_text end
    where cast_id = job_row.cast_id
      and provider = 'estama';
  end if;

  update public.automation_connections
  set last_reconciled_at = now(),
      last_error = case when result_ok then last_error else error_text end,
      status = case
        when not result_ok and coalesce(error_text, '') ~ '再ログイン|ログイン' then 'expired'
        else status
      end
  where store_id = job_row.store_id
    and provider = 'estama';

  return true;
end;
$$;

revoke all on function public.report_estama_shift_result(text, uuid, jsonb) from public;
grant execute on function public.report_estama_shift_result(text, uuid, jsonb)
  to anon, authenticated, service_role;
