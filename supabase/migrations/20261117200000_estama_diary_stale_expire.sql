-- 写メ日記は「本日」「残り1枠」など日付に依存する内容。送れないまま何日も
-- 「送信待ち」に残った投稿を後から自動で送ると、お客様に古い情報を出してしまう。
-- 48時間送れなかったものは自動送信を取り消し、無期限に残らないようにする。
-- 送信を始めたもの（submission_started_at あり）は掲載確認が要るので触らない。
create or replace function private.expire_stale_estama_diary_jobs() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with expired as (
    update public.automation_jobs
       set status = 'cancelled',
           finished_at = now(),
           error_message = '48時間以上送信できなかったため自動送信を取り消しました（日付の内容が古くなるため）'
     where job_type = 'estama_post_diary'
       and status in ('queued', 'waiting_for_login')
       and submission_started_at is null
       and created_at < now() - interval '48 hours'
    returning payload->>'post_id' as post_id
  )
  update public.cast_posts p
     set esutama_status = 'failed',
         esutama_error = '48時間以上送信できなかったため自動送信を取り消しました'
    from expired e
   where p.id = (e.post_id)::uuid
     and p.esutama_status in ('pending', 'posting', 'queued');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function private.expire_stale_estama_diary_jobs() from public, anon, authenticated;

select cron.schedule('estama-diary-stale-expire', '17 * * * *', 'select private.expire_stale_estama_diary_jobs()');

-- 2026年8〜10月から送信待ちのまま残っていた10件を、この場で取り消す。
select private.expire_stale_estama_diary_jobs();
