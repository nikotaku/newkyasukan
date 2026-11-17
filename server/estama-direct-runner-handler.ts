import { getAdminClient, authenticateUser, assertStoreManager, requireSingleDiaryImageUrls } from './estama-automation.js';
import { verifyActionsIdentity } from './github-actions-identity.js';
import { summarizeAutomation } from './automation-runner-summary.js';

const STORE_ID = '404499ab-5350-490f-9608-5814faffda6f';
type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown>; query?: Record<string, string | string[] | undefined> };
type Response = { status(code: number): Response; json(body: unknown): void; setHeader(name: string, value: string): void };
// 送信前の準備で止まった理由。管理画面にそのまま出す（認証情報・本文は含めない）。
class PrepareError extends Error {}
const checked = <T extends { data: unknown; error: unknown }>(value: T): T['data'] => { if (value.error) throw new Error('database_operation_failed'); return value.data; };

async function prepare(admin: ReturnType<typeof getAdminClient>, castId: string, postId?: string) {
  const [cast, external, credentials, connection, post] = await Promise.all([
    admin.from('casts').select('name').eq('store_id', STORE_ID).eq('id', castId).eq('is_active', true).maybeSingle(),
    admin.from('external_cast_profiles').select('external_cast_id,remote_name,public_profile_url').eq('store_id', STORE_ID).eq('cast_id', castId).eq('provider', 'estama').eq('sync_status','synced').maybeSingle(),
    admin.from('cast_site_credentials').select('login_id,password').eq('store_id', STORE_ID).eq('cast_id', castId).eq('site', 'esutama').maybeSingle(),
    admin.from('automation_connections').select('shop_id').eq('store_id', STORE_ID).eq('provider','estama').maybeSingle(),
    postId ? admin.from('cast_posts').select('title,body,image_urls,esutama_status').eq('store_id', STORE_ID).eq('cast_id', castId).eq('id',postId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  [cast,external,credentials,connection,post].forEach(checked);
  if (!cast.data) throw new PrepareError('セラピストが在籍中ではありません');
  if (!external.data) throw new PrepareError('エステ魂のセラピストと紐付いていません。エスたま自動化で連携してください');
  if (!credentials.data?.login_id || !credentials.data.password) throw new PrepareError('魂セラピストのログイン情報が未登録です');
  if (postId && (!post.data || post.data.esutama_status !== 'posting')) throw new PrepareError('投稿が送信待ちの状態ではありません');
  if (post.data) {
    try { requireSingleDiaryImageUrls(post.data.image_urls); }
    catch { throw new PrepareError('写真は1枚だけ付けてください'); }
  }
  return {
    browserbaseContextId: '',
    soulCredentials: { loginId: credentials.data.login_id, email: credentials.data.login_id, password: credentials.data.password },
    cast: { name: cast.data.name, externalId: external.data.external_cast_id, remoteName: external.data.remote_name, publicUrl: external.data.public_profile_url, shopId: connection.data?.shop_id },
    post: post.data ? { title: post.data.title, body: post.data.body, imageUrls: post.data.image_urls } : { body: '', imageUrls: [] },
  };
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control','private, no-store');
  const action = String(req.body?.action || '');
  try {
    // Dashboard uses the same explicit store-manager authorization as existing automation.
    if (req.method === 'GET' || ['cancel','retry'].includes(action)) {
      const { admin: userClient, user } = await authenticateUser(req);
      await assertStoreManager(userClient,user.id,STORE_ID);
      const admin = getAdminClient();
      if (req.method !== 'GET') {
        const changed = checked(await admin.rpc('manage_estama_direct_job', { p_store_id: STORE_ID, p_job_id: req.body?.jobId, p_action: action }));
        res.status(changed ? 200 : 409).json({ changed, error: changed ? undefined : '送信済み・要確認・取消済みの処理は再送できません' }); return;
      }
      // Paginate instead of silently truncating at PostgREST's row limit.
      const jobs: Record<string, any>[] = [];
      for (let offset=0; ; offset+=1000) {
        const rows = checked(await admin.from('automation_jobs').select('id,job_type,status,runner,created_at,started_at,finished_at,duration_ms,submission_started_at,error_message,result').eq('store_id',STORE_ID).order('created_at',{ascending:false}).range(offset,offset+999)) as Record<string,any>[];
        jobs.push(...rows); if (rows.length<1000) break;
      }
      const settings = checked(await admin.from('automation_runner_settings').select('*').eq('store_id',STORE_ID).single());
      const runs = checked(await admin.from('automation_runner_runs').select('*').eq('store_id',STORE_ID).gte('started_at',new Date(new Date().getUTCFullYear(),new Date().getUTCMonth(),1).toISOString()).order('started_at',{ascending:false}).limit(1000)) as Record<string,any>[];
      res.status(200).json({ settings, summary: summarizeAutomation(jobs,runs), jobs: jobs.filter(j=>['queued','running','failed','review_required'].includes(j.status)).slice(0,100), runs: runs.slice(0,10) }); return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const authorization = req.headers?.authorization;
    let identity;
    try { identity = await verifyActionsIdentity(typeof authorization==='string' ? authorization.replace(/^Bearer /,'') : ''); }
    catch { res.status(401).json({ error:'invalid_actions_identity' }); return; }
    const admin = getAdminClient();
    const runId = `${identity.run_id}:${identity.run_attempt}`;
    const settings = checked(await admin.from('automation_runner_settings').select('*').eq('store_id',STORE_ID).single()) as any;
    if (action === 'start') {
      const mode = req.body?.mode === 'work' ? 'work' : 'audit';
      if ((mode==='work' && (!settings.diary_enabled || identity.event_name!=='workflow_dispatch')) || (mode==='audit' && !settings.audit_enabled)) { res.status(409).json({ error:'runner_disabled' }); return; }
      // Usage is advisory for the public repository's standard hosted runner.
      // Unique run key rejects duplicate workers and replayed start requests.
      const result = await admin.from('automation_runner_runs').insert({ run_id:runId,store_id:STORE_ID,mode });
      if (result.error) { res.status(409).json({error:'run_already_started'}); return; }
      res.status(200).json({ ok:true }); return;
    }
    const run = checked(await admin.from('automation_runner_runs').select('mode,status').eq('run_id',runId).eq('store_id',STORE_ID).single()) as any;
    if (run.status!=='running') { res.status(409).json({error:'run_not_active'}); return; }
    checked(await admin.from('automation_runner_runs').update({ heartbeat_at:new Date().toISOString() }).eq('run_id',runId).eq('status','running'));
    if (action === 'audit') {
      if (run.mode!=='audit') throw new Error('invalid_mode');
      const recent = checked(await admin.from('automation_jobs').select('cast_id').eq('store_id',STORE_ID).eq('job_type','estama_post_diary').eq('status','completed').order('finished_at',{ascending:false}).limit(30)) as any[];
      const work=[];
      for (const castId of [...new Set(recent.map(j=>j.cast_id))]) {
        try { work.push(await prepare(admin,castId)); } catch { continue; }
        if (work.length===2) break;
      }
      if (!work.length) throw new Error('audit_accounts_unavailable');
      // Browserbase をやめる準備：店舗管理画面に毎回ログインできるかも確かめる（読むだけ。ログイン情報は Vault から）
      const login = checked(await admin.rpc('get_estama_admin_login_for_runner',{p_store_id:STORE_ID})) as {mail?:string;password?:string}|null;
      const adminLogin = login?.mail && login.password ? { mail: login.mail, password: login.password } : null;
      res.status(200).json({ work, adminLogin }); return;
    }
    if (action === 'claim') {
      if (run.mode!=='work' || identity.event_name!=='workflow_dispatch') throw new Error('invalid_mode');
      const job = checked(await admin.rpc('claim_estama_direct_job',{p_store_id:STORE_ID,p_run_id:runId})) as any;
      if (!job) { res.status(200).json({ work:null }); return; }
      try {
        const prepared=await prepare(admin,job.cast_id,job.payload.post_id);
        res.status(200).json({work:{...prepared,jobId:job.id,lease:job.runner_lease}}); return;
      } catch (error) {
        const reason = error instanceof PrepareError ? error.message : '投稿データ・認証設定を確認してください';
        checked(await admin.rpc('finish_estama_direct_job',{p_job_id:job.id,p_lease:job.runner_lease,p_run_id:runId,p_status:'failed',p_result:{},p_error:`${reason}（送信前に停止）`}));
        throw new Error('job_preparation_failed');
      }
    }
    if (action==='heartbeat' || action==='submitting') {
      const fields: Record<string,string>={heartbeat_at:new Date().toISOString()};
      if(action==='submitting') fields.submission_started_at=new Date().toISOString();
      if(req.body?.jobId) {
        const row=checked(await admin.from('automation_jobs').update(fields).eq('id',req.body.jobId).eq('runner','github_actions').eq('runner_run_id',runId).eq('runner_lease',req.body.lease).eq('status','running').select('id').maybeSingle());
        if(!row) { res.status(409).json({error:'lease_lost'}); return; }
      }
      res.status(200).json({ok:true}); return;
    }
    if(action==='finish') {
      const raw=req.body?.result as any;
      const result = raw?.posted===true && typeof raw.url==='string' && /^https:\/\/estama\.jp\//.test(raw.url) && raw.uploadedPhotos===1
        ? {posted:true,url:raw.url,uploadedPhotos:1} : {};
      const status=req.body?.status==='completed'?'completed':req.body?.status==='review_required'?'review_required':'failed';
      const error=status==='completed'?null:status==='review_required'?'【要確認・再送停止】掲載結果を確認してください':'投稿処理に失敗しました。認証・画像・接続状態を確認してください（送信前）';
      const ok=checked(await admin.rpc('finish_estama_direct_job',{p_job_id:req.body?.jobId,p_lease:req.body?.lease,p_run_id:runId,p_status:status,p_result:result,p_error:error}));
      res.status(ok?200:409).json({ok}); return;
    }
    if(action==='end') {
      const ok=req.body?.ok===true;
      const adminLogin=['ok','failed','unavailable'].includes(String(req.body?.adminLogin)) ? String(req.body?.adminLogin) : undefined;
      const adminLoginStage=typeof req.body?.adminLoginStage==='string' ? req.body.adminLoginStage.replace(/[^a-z_]/g,'').slice(0,40) : undefined;
      // 失敗の手がかり（ランナー側でメール・パスワードを消してある。念のためメールらしい文字も消す）
      const adminLoginDetail=typeof req.body?.adminLoginDetail==='string' ? req.body.adminLoginDetail.replace(/\S+@\S+/g,'[mail]').slice(0,200) : undefined;
      const result={ok,verifiedAccounts:Math.max(0,Math.min(2,Number(req.body?.verifiedAccounts)||0)),failedAccounts:Math.max(0,Math.min(2,Number(req.body?.failedAccounts)||0)),...(adminLogin?{adminLogin}:{}),...(adminLoginStage?{adminLoginStage}:{}),...(adminLoginDetail?{adminLoginDetail}:{})};
      // Includes setup time supplied from workflow start; bounded by the job timeout.
      const duration=Math.max(0,Math.min(1200000,Number(req.body?.durationMs)||0));
      checked(await admin.from('automation_runner_runs').update({status:ok?'completed':'failed',finished_at:new Date().toISOString(),duration_ms:duration,result}).eq('run_id',runId).eq('status','running'));
      if(run.mode==='audit') checked(await admin.from('automation_runner_settings').update({last_audit_at:new Date().toISOString(),last_audit_result:result}).eq('store_id',STORE_ID));
      res.status(200).json({ok:true}); return;
    }
    res.status(400).json({error:'unknown_action'});
  } catch {
    // Never serialize exceptions from browser or database SDKs: they can contain account data.
    res.status(422).json({error:'runner_request_failed'});
  }
}
