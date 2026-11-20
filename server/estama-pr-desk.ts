import { createHash } from "node:crypto";
import type { Page, Locator } from "playwright-core";
import { clickWithScopedConfirmation } from "./playwright-actions.js";
import { isConfirmedEstamaAppeal, parseEstamaLastAppeal } from "./estama-appeal.js";
import { ensureAdminLogin } from "./estama-automation.js";
import { postEstamaStoreNewsOnPage, type EstamaStoreNewsArticle } from "./estama-store-news.js";

type Task = {kind:string;body:string;expires_at:string;article?:EstamaStoreNewsArticle;coupon?:{id:string;name:string}};
type Result = {status:"sent"|"skipped"|"review";detail:Record<string,unknown>};
async function menu(page:Page,label:RegExp) {
  await page.goto("https://estama.jp/admin/",{waitUntil:"domcontentloaded"});
  await ensureAdminLogin(page);
  const link=page.getByRole("link",{name:label}).first();
  const path=await link.getAttribute("href",{timeout:5000});
  const url=new URL(path || "",page.url());
  if(url.origin!=="https://estama.jp" || !url.pathname.startsWith("/admin/") || !path) throw new Error("店舗メニューを特定できません");
  await page.goto(url.href,{waitUntil:"domcontentloaded"});
  await ensureAdminLogin(page);
}
const checkTime=(until:string)=>{if(Date.parse(until)<=Date.now()) throw new Error("掲載期限を過ぎました");};
function submitAction(scope:Locator, pattern:RegExp) {
  return scope.getByRole("button",{name:pattern}).or(scope.getByRole("link",{name:pattern}));
}
async function one(scope:Locator) {
  if(await scope.count()!==1 || !await scope.isVisible()) throw new Error("対象の操作欄を特定できません");
  return scope;
}
function counters(text:string) {
  return {remaining:Number(text.normalize("NFKC").match(/残り\s*(\d+)\s*回/)?.[1]??NaN),last:parseEstamaLastAppeal(text)};
}
async function appealCard(page:Page,label:RegExp) {
  const title=await one(page.getByText(label,{exact:true}).filter({visible:true}));
  // Smallest ancestor containing both the daily allowance and last appeal.
  return one(title.locator("xpath=ancestor::*[contains(.,'最終アピール') and contains(.,'残り')][1]"));
}
export async function runPrTask(page:Page,task:Task,shopId:string,reserveInvite:(key:string,couponId:string)=>Promise<boolean>):Promise<Result> {
  checkTime(task.expires_at);
  if(task.kind==="invites"){
    if(!task.coupon) return {status:"skipped",detail:{message:"有効なクーポンがありません"}};
    await menu(page,/^(?:招待待ち(?:ユーザー)?(?:一覧)?|招待メッセージ(?:管理)?)$/);
    const cards=page.locator("tr:visible, li:visible, article:visible").filter({hasText:/招待待ち/}).filter({hasText:/PREMIUM|プレミアム/i});
    let sent=0;
    for(const card of await cards.all()){
      const send=submitAction(card,/^招待(?:メッセージを送信|を送る|する)$/);
      if(await send.count()!==1) continue;
      const id=await card.getAttribute("data-user-id") || await card.locator("input[name='user_id']").first().getAttribute("value",{timeout:500}).catch(()=>null);
      if(!id || !/^[a-zA-Z0-9_-]{1,90}$/.test(id)) throw new Error("招待先を識別できません");
      // Open only the compose form; submission occurs after recipient and coupon verification.
      const editor=card.locator("form").filter({has:page.locator("textarea")});
      if(await editor.count()!==1) throw new Error("招待文・クーポンの入力画面を確認してください");
      const field=await one(editor.locator("textarea:visible"));
      const coupon=await one(editor.locator("select:visible").filter({has:page.getByRole("option",{name:task.coupon.name,exact:true})}));
      await field.fill(task.body);
      await coupon.selectOption({label:task.coupon.name});
      const button=await one(submitAction(editor,/^(?:招待する|招待メッセージを送信|送信する)$/));
      checkTime(task.expires_at);
      const key=createHash("sha256").update(shopId+"|"+id).digest("hex");
      if(!await reserveInvite(key,task.coupon.id)) continue;
      await clickWithScopedConfirmation(page,button);
      if(!await page.getByText(/招待メッセージを送信しました|招待が完了しました/).isVisible()) return {status:"review",detail:{message:"招待の送信結果を確認できません",sent}};
      sent++;
      // Navigation may replace the recipient list. Never reuse the old list.
      break;
    }
    return {status:sent?"sent":"skipped",detail:{message:sent?"招待メッセージとクーポンを送信":"対象者または新しい招待先なし",sent}};
  }
  // ニュースは4種類（今すぐご案内・本日の出勤・セラピスト紹介・クーポン紹介）とも、記事の画像を付けてエステ魂のニュースへ
  if(task.kind.startsWith("news") && task.article) {
    const result=await postEstamaStoreNewsOnPage(page,task.article,"https://estama.jp/shop/"+encodeURIComponent(shopId)+"/newslist/");
    return {status:"sent",detail:{url:result.url}};
  }
  if(task.kind==="realtime" || task.kind==="recruiting"){
    const label=task.kind==="realtime" ? /^リアルタイム集客$/ : /^リアルタイム求人$/;
    const category=task.kind==="realtime"?"guest":"job";
    const url="https://estama.jp/admin/"+category+"/realtime/edit/update/";
    await page.goto(url,{waitUntil:"domcontentloaded"});
    await ensureAdminLogin(page,"#PostContent");
    const field=page.locator("#PostContent");
    const title=page.locator("#PostTitle");
    await title.fill(task.kind==="realtime"?"本日のご案内":"セラピスト募集のお知らせ");
    const form=page.locator("body");
    const limit=await field.getAttribute("maxlength");
    if(limit && task.body.length>Number(limit)) throw new Error("媒体の文字数上限を超えています");
    await field.fill(task.body);
    const button=await one(form.getByText("更新する",{exact:true}).filter({visible:true}));
    checkTime(task.expires_at);
    await clickWithScopedConfirmation(page,button);
    await menu(page,label);
    const published=page.getByText(task.body,{exact:true}).filter({visible:true});
    if(!await published.count()) return {status:"review",detail:{message:"保存後の本文を確認できません"}};
    return {status:"sent",detail:{message:"掲載本文を確認"}};
  }
  const attendance=task.kind==="attendance";
  if(!attendance && !["job_appeal","guest_appeal"].includes(task.kind)) throw new Error("配信対象を確認できません");
  const menuLabel=task.kind==="job_appeal" ? /^求人ワンクリックアピール$/ : /^集客ワンクリックアピール$/;
  await menu(page,menuLabel);
  const title=attendance ? /^出勤情報$/ : task.kind==="job_appeal" ? /^求人(?:情報|アピール)$/ : /^店舗(?:情報|アピール)$/;
  const card=await appealCard(page,title);
  const before=counters(await card.innerText());
  if(!Number.isFinite(before.remaining)) throw new Error("媒体の残回数を読み取れません");
  if(before.remaining<1) return {status:"skipped",detail:{message:"残り0回"}};
  const action=await one(submitAction(card,attendance ? /^編集する$/ : /^アピール(する)?$/));
  checkTime(task.expires_at);
  if(attendance){
    await action.click();
    await ensureAdminLogin(page);
    const save=await one(submitAction(page.locator("form:visible"),/^(出勤情報を)?(保存|更新|登録)(する)?$/));
    checkTime(task.expires_at);
    await clickWithScopedConfirmation(page,save);
  }else await clickWithScopedConfirmation(page,action);
  await menu(page,menuLabel);
  const after=counters(await (await appealCard(page,title)).innerText());
  const confirmed=isConfirmedEstamaAppeal({beforeRemaining:before.remaining,afterRemaining:after.remaining,beforeLastAppeal:before.last,afterLastAppeal:after.last});
  return {status:confirmed?"sent":"review",detail:{before,after,message:"残り "+before.remaining+" → "+after.remaining+" 回／最終 "+(after.last||"不明")}};
}
