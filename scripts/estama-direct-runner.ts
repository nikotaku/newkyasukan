import { runPrTask } from '../server/estama-pr-desk.js';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { auditPreparedEstamaDiaryOnPage, runEstamaAvailabilityOnPage, runPreparedEstamaDiaryOnPage, runShiftJobOnPage, type PreparedEstamaDiary } from '../server/estama-automation.js';
import { assertUploadedPhotoCount } from '../server/estama-photo-upload.js';
import { loginEstamaAdmin, scrubSecrets } from '../server/estama-relogin.js';

const endpoint='https://enka-salon.jp/api/automations/estama-direct-runner';
const mode=process.env.ESTAMA_RUN_MODE==='pr'?'pr':process.env.ESTAMA_RUN_MODE==='work'?'work':process.env.ESTAMA_RUN_MODE==='availability'?'availability':'audit';
const started=Number(process.env.RUN_STARTED_MS)||Date.now();
let browser: Browser | undefined;
let current: {jobId:string;lease:string} | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let leaseLost=false;
let verifiedAccounts=0, failedAccounts=0, processed=0, ok=true, runStarted=false;
// 店舗管理画面のログイン確認（Browserbase をやめる準備）。結果は ok / failed / unavailable と止まった段階だけ
let adminLogin: 'ok'|'failed'|'unavailable'|undefined, adminLoginStage: string|undefined, adminLoginDetail: string|undefined;

// 画面なしのブラウザは「HeadlessChrome」と名乗るので、普通の Chrome と同じ名乗りにする（ログイン画面の reCAPTCHA で弾かれないように）
function openContext(target: Browser) {
  const userAgent=`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${target.version()} Safari/537.36`;
  return target.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:1440,height:1000},userAgent});
}

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
    browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});
    for(const item of work as PreparedEstamaDiary[]) {
      if(leaseLost) throw new Error('lease_lost');
      const context=await openContext(browser);
      const page=await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(35000);
      let stage="browser_ready";
      try { await auditPreparedEstamaDiaryOnPage(item,page,value=>{stage=value;}); verifiedAccounts++; }
      catch { console.log(JSON.stringify({event:"account_audit_failed",stage})); failedAccounts++; ok=false; }
      finally { await context.close(); }
    }
    // 店舗管理画面に新しいブラウザでログインできるか（読むだけ。保存も投稿もしない）
    if(!adminCredentials) adminLogin='unavailable';
    else {
      const context=await openContext(browser);
      const page=await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(35000);
      try {
        const result=await loginEstamaAdmin(page,adminCredentials.mail,adminCredentials.password);
        adminLogin=result.ok?'ok':'failed';
        if (result.ok) {
          // Only report navigation labels and same-site paths, never form values or query strings.
          const links = await page.locator('a[href]').evaluateAll(anchors => anchors.flatMap(anchor => {
            const label = (anchor.textContent || '').trim();
            const url = new URL((anchor as HTMLAnchorElement).href);
            return /リアルタイム|ワンクリックアピール|招待/.test(label) && url.origin === 'https://estama.jp' && url.pathname.startsWith('/admin/')
              ? [{ label: label.slice(0, 60), path: url.pathname }] : [];
          }));
          console.log(JSON.stringify({event: 'estama_realtime_navigation', links}));
          for (const path of new Set(links.map(link => link.path))) {
            await page.goto('https://estama.jp'+path,{waitUntil:'domcontentloaded'});
            const controls = await page.evaluate(() => ({
              links: Array.from(document.querySelectorAll('main a[href],article a[href],form a[href],a[href*="edit"],a[href*="invite"]')).flatMap(el=>{
                const url=new URL((el as HTMLAnchorElement).href);
                const label=(el.textContent||'').trim();
                if(url.origin!=='https://estama.jp' || !url.pathname.startsWith('/admin/') || !/リアルタイム|編集|招待|登録|新規|投稿/.test(label) || label.length>35) return [];
                return [{label,path:url.pathname.replace(/\d+/g,'[id]')}];
              }).slice(0,45),
              forms: Array.from(document.forms).map(form => ({
                action: new URL(form.action).pathname,
                fields: Array.from(form.querySelectorAll('input:not([type=hidden]):not([type=password]),textarea,select,button')).map(el => ({
                  tag:el.tagName, name:el.getAttribute('name'), id:el.id, type:el.getAttribute('type'),
                  button:el.matches('button,input[type=submit]') ? (el.textContent || el.getAttribute('value') || '').trim().slice(0,30) : undefined,
                })).slice(0,25)
              })).slice(0,10),
              actions: Array.from(document.querySelectorAll('a,button')).map(el => (el.textContent||'').trim()).filter(text => /^(編集する|アピールする|投稿する|招待する|更新する|保存する|登録する|送信する)$/.test(text)).slice(0,20)
            }));
            console.log(JSON.stringify({event:'estama_pr_controls',path,controls}));
          }
        }
        if(!result.ok) {
          adminLoginStage=/画面が見つかりません/.test(result.error)?'login_form_missing':/admin/.test(page.url())?'editor_missing':'login_rejected';
          adminLoginDetail=scrubSecrets(`${result.error} @ ${new URL(page.url()).pathname}`,[adminCredentials.mail,adminCredentials.password]).slice(0,200);
        }
      } catch(error) {
        adminLogin='failed'; adminLoginStage='browser_error';
        // 原因を見られるように、エラーの1行目と止まった画面のパスだけ残す（メール・パスワードは消す）
        const first=error instanceof Error?`${error.name}: ${error.message.split('\n')[0]}`:'unknown';
        let path=''; try { path=new URL(page.url()).pathname; } catch { path=''; }
        adminLoginDetail=scrubSecrets(`${first} @ ${path}`,[adminCredentials.mail,adminCredentials.password]).slice(0,200);
      }
      finally { await context.close(); }
      if(adminLogin!=='ok') ok=false;
    }
  } else if(mode==='pr') {
    const {login,shopId}=await request({action:'pr_login'});
    browser=await chromium.launch({headless:true});
    const context=await openContext(browser);
    const page=await context.newPage(); page.setDefaultTimeout(12000);
    try {
      const result=await loginEstamaAdmin(page,login.mail,login.password);
      if(!result.ok) throw new Error('admin_login_failed');
      while(!leaseLost && processed<15 && Date.now()-started<11*60000) {
        const {work}=await request({action:'pr_claim'});
        if(!work) break;
        let outcome;
        try { outcome=await runPrTask(page,work,shopId,async (recipient,couponId) => (await request({action:"pr_reserve_invite",id:work.id,recipient,couponId})).reserved === true); }
        catch(error) {
          const message=scrubSecrets(error instanceof Error?error.message.split('\n')[0]:'操作を確認できません',[login.mail,login.password]).slice(0,160);
          outcome={status:'review',detail:{message}};
        }
        await request({action:'pr_finish',id:work.id,...outcome});
        processed++;
      }
    } finally { await context.close(); }
  } else if(mode==='availability') {
    // ご案内状況（今すぐ）：店舗の管理画面にログインして、勤務中の人を「今すぐ」にする。結果の記録は受け口が行う
    const {work}=await request({action:'availability_claim'});
    if(work) {
      const secrets=[work.adminLogin?.mail,work.adminLogin?.password];
      browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});
      const context=await openContext(browser);
      const page=await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(35000);
      try {
        const login=await loginEstamaAdmin(page,work.adminLogin.mail,work.adminLogin.password);
        if(!login.ok) throw new Error(login.error);
        const result=await runEstamaAvailabilityOnPage(page);
        await request({action:'availability_finish',startedAt:work.startedAt,result});
        processed++;
      } catch(error) {
        ok=false;
        const message=scrubSecrets(error instanceof Error?error.message.split('\n')[0]:String(error),secrets).slice(0,300);
        await request({action:'availability_finish',startedAt:work.startedAt,error:message}).catch(()=>{});
      } finally { await context.close().catch(()=>{}); }
    }
  } else {
    // 写メ日記は10件まで（セラピストごとに新しい画面）。出勤同期は店舗の管理画面に1回ログインして続けて処理する（12分まで）
    let adminContext: BrowserContext | undefined, adminPage: Page | undefined;
    while(processed<80 && Date.now()-started<12*60000 && !leaseLost) {
      const {work}=await request({action:'claim'});
      if(!work) break;
      current={jobId:work.jobId,lease:work.lease};
      if(work.type==='shift') {
        const secrets=[work.adminLogin?.mail,work.adminLogin?.password];
        try {
          browser ||= await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});
          if(!adminPage) {
            adminContext=await openContext(browser);
            adminPage=await adminContext.newPage(); adminPage.setDefaultTimeout(15000); adminPage.setDefaultNavigationTimeout(35000);
            const login=await loginEstamaAdmin(adminPage,work.adminLogin.mail,work.adminLogin.password);
            if(!login.ok) throw new Error(login.error);
          }
          const outcome=await runShiftJobOnPage(adminPage,work.plan);
          await request({action:'finish_shift',...current,outcome});
        } catch(error) {
          ok=false;
          const message=scrubSecrets(error instanceof Error?error.message.split('\n')[0]:String(error),secrets).slice(0,300);
          await request({action:'finish_shift',...current,error:message}).catch(()=>{leaseLost=true;});
          // ログインに失敗した・画面が壊れたときは、次の作業のために開き直す
          await adminContext?.close().catch(()=>{}); adminContext=undefined; adminPage=undefined;
        } finally { current=undefined; }
        processed++;
        continue;
      }
      let submitting=false;
      let context;
      try {
        browser ||= await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});
        context=await openContext(browser);
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
  if(runStarted) await request({action:'end',ok:ok&&!leaseLost,verifiedAccounts,failedAccounts,adminLogin,adminLoginStage,adminLoginDetail,durationMs:Date.now()-started}).catch(()=>{ok=false;});
  // Only aggregate counts: never credentials, pages, screenshots, traces, payloads or raw errors.
  console.log(JSON.stringify({event:'estama_direct_runner',mode,ok:ok&&!leaseLost,verifiedAccounts,failedAccounts,adminLogin,adminLoginStage,adminLoginDetail,processed,elapsedMs:Date.now()-started}));
  if(!ok||leaseLost) process.exitCode=1;
}
