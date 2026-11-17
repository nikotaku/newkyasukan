import { chromium, type Browser } from 'playwright-core';
import { auditPreparedEstamaDiaryOnPage, runPreparedEstamaDiaryOnPage, type PreparedEstamaDiary } from '../server/estama-automation.js';
import { assertUploadedPhotoCount } from '../server/estama-photo-upload.js';
import { loginEstamaAdmin } from '../server/estama-relogin.js';

const endpoint='https://enka-salon.jp/api/automations/estama-direct-runner';
const mode=process.env.ESTAMA_RUN_MODE==='work'?'work':'audit';
const started=Number(process.env.RUN_STARTED_MS)||Date.now();
let browser: Browser | undefined;
let current: {jobId:string;lease:string} | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let leaseLost=false;
let verifiedAccounts=0, failedAccounts=0, processed=0, ok=true, runStarted=false;
// 店舗管理画面のログイン確認（Browserbase をやめる準備）。結果は ok / failed / unavailable と止まった段階だけ
let adminLogin: 'ok'|'failed'|'unavailable'|undefined, adminLoginStage: string|undefined;

async function request(body: Record<string,unknown>) {
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL!);
  url.searchParams.set('audience','https://enka-salon.jp/estama-direct-runner');
  const identity=await fetch(url,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(15000)});
  if(!identity.ok) throw new Error('identity_unavailable');
  const {value}=await identity.json();
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${value}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`runner_http_${response.status}`);
  return response.json();
}

try {
  // Production deployment may follow the main push. No browser or credentials while waiting.
  let ready=false;
  for(let attempt=0;attempt<20;attempt++) {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)}).catch(()=>null);
    if(response?.status===401) { ready=true; break; }
    await new Promise(resolve=>setTimeout(resolve,15000));
  }
  if(!ready) throw new Error('production_endpoint_unavailable');
  await request({action:'start',mode}); runStarted=true;
  heartbeat=setInterval(()=>{ void request({action:'heartbeat',...current}).catch(()=>{
    leaseLost=true; void browser?.close().catch(()=>{});
  }); },30000);
  if(mode==='audit') {
    const {work,adminLogin:adminCredentials}=await request({action:'audit'});
    browser=await chromium.launch({headless:true});
    for(const item of work as PreparedEstamaDiary[]) {
      if(leaseLost) throw new Error('lease_lost');
      const context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:1440,height:1000}});
      const page=await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(35000);
      let stage="browser_ready";
      try { await auditPreparedEstamaDiaryOnPage(item,page,value=>{stage=value;}); verifiedAccounts++; }
      catch { console.log(JSON.stringify({event:"account_audit_failed",stage})); failedAccounts++; ok=false; }
      finally { await context.close(); }
    }
    // 店舗管理画面に新しいブラウザでログインできるか（読むだけ。保存も投稿もしない）
    if(!adminCredentials) adminLogin='unavailable';
    else {
      const context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:1440,height:1000}});
      const page=await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(35000);
      try {
        const result=await loginEstamaAdmin(page,adminCredentials.mail,adminCredentials.password);
        adminLogin=result.ok?'ok':'failed';
        if(!result.ok) adminLoginStage=/画面が見つかりません/.test(result.error)?'login_form_missing':/admin/.test(page.url())?'editor_missing':'login_rejected';
      } catch { adminLogin='failed'; adminLoginStage='browser_error'; }
      finally { await context.close(); }
      if(adminLogin!=='ok') ok=false;
    }
  } else {
    // 10 jobs / 12 minutes, one browser and a fresh isolated context for each therapist.
    while(processed<10 && Date.now()-started<12*60000 && !leaseLost) {
      const {work}=await request({action:'claim'});
      if(!work) break;
      current={jobId:work.jobId,lease:work.lease};
      let submitting=false;
      let context;
      try {
        browser ||= await chromium.launch({headless:true});
        context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:1440,height:1000}});
        const page=await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(35000);
        const result=await runPreparedEstamaDiaryOnPage(work,page,async()=>{
          if(leaseLost) throw new Error('lease_lost');
          submitting=true;
          await request({action:'submitting',...current});
          if(leaseLost) throw new Error('lease_lost');
        });
        assertUploadedPhotoCount(1,result.uploadedPhotos);
        await request({action:'finish',...current,status:'completed',result});
      } catch {
        ok=false;
        // No retry, even when the server persisted a result but its response was lost.
        await request({action:'finish',...current,status:submitting?'review_required':'failed'}).catch(()=>{leaseLost=true;});
      } finally { await context?.close().catch(()=>{}); current=undefined; }
      processed++;
    }
  }
} catch { ok=false; }
finally {
  if(heartbeat) clearInterval(heartbeat);
  await browser?.close().catch(()=>{});
  if(runStarted) await request({action:'end',ok:ok&&!leaseLost,verifiedAccounts,failedAccounts,adminLogin,adminLoginStage,durationMs:Date.now()-started}).catch(()=>{ok=false;});
  // Only aggregate counts: never credentials, pages, screenshots, traces, payloads or raw errors.
  console.log(JSON.stringify({event:'estama_direct_runner',mode,ok:ok&&!leaseLost,verifiedAccounts,failedAccounts,adminLogin,adminLoginStage,processed,elapsedMs:Date.now()-started}));
  if(!ok||leaseLost) process.exitCode=1;
}
