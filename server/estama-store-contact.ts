// 艶華OSの「連絡先・SNS（正本）」を、エステ魂の店舗基本情報へ書き換える。
//   pg_cron（private.dispatch_store_contact_sync）→ /api/cron/estama-appeal?action=estama-scout（mode: store-contact）
//   1. RPC start_store_contact_sync で正本の値を受け取る（store_contact_sync の target = estama）
//   2. /admin/shop/contact/edit/ … 電話（tel[0..2]）・公開メール（sub_mail）・LINEのURL（shop_line_url）
//      /admin/shop/info/edit/    … X（twitter_id、@なしのID）・ブログ（blog_url）
//      ほかの欄（Web予約の受付・営業時間・カード など）には触らない。「保存と同時に上位表示する」は外す
//   3. 編集画面を開き直して値が入ったか確かめ、RPC finish_store_contact_sync に記録
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "playwright-core";
import {
  connectSession,
  createBrowserSession,
  disconnect,
  ensureAdminLogin,
  LoginRequiredError,
  releaseSession,
  type Connection,
} from "./estama-automation.js";

const CONTACT_URL = "https://estama.jp/admin/shop/contact/edit/";
const INFO_URL = "https://estama.jp/admin/shop/info/edit/";

import { estamaContactPlan, type StoreContactValues } from "./estama-store-contact-plan.js";
export { estamaContactPlan, estamaTwitterId, splitEstamaPhone, type StoreContactValues } from "./estama-store-contact-plan.js";

async function readFields(page: Page, names: string[]) {
  return page.evaluate((list) => Object.fromEntries(list.map((name) => {
    const input = document.querySelector<HTMLInputElement>(`form [name="${CSS.escape(name)}"]`);
    return [name, input ? input.value : null];
  })), names);
}

async function fillAndSave(page: Page, url: string, fields: Record<string, string>) {
  const names = Object.keys(fields);
  if (!names.length) return { changed: false, before: {}, after: {} };
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await ensureAdminLogin(page);
  const before = await readFields(page, names);
  const missing = names.filter((name) => before[name] === null);
  if (missing.length) throw new Error(`エステ魂の画面に欄が見つかりません（${missing.join("・")}）。画面が変わった可能性があります`);
  if (names.every((name) => before[name] === fields[name])) return { changed: false, before, after: before };

  for (const name of names) {
    const input = page.locator(`form [name="${name}"]`).first();
    await input.fill(fields[name]);
  }
  // 「保存と同時に上位表示する」は回数に限りがあるので使わない
  const boost = page.locator("#set_up_limit");
  if (await boost.count() && await boost.isChecked().catch(() => false)) {
    await boost.uncheck({ force: true }).catch(async () => {
      await boost.evaluate((element) => { (element as HTMLInputElement).checked = false; });
    });
  }
  const save = page.locator("form[method=POST] .btn-default_submit, form[method=POST] button, form[method=POST] input[type=submit]")
    .filter({ hasText: /保存|変更|登録/ }).first();
  if (!(await save.count())) throw new Error("「保存する」ボタンが見つかりません（エステ魂の画面が変わった可能性）");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined),
    save.click(),
  ]);
  await page.waitForTimeout(1_500);
  const validation = await page.locator(".vali_error, .validation-error.active-error, .alert-danger").allInnerTexts().catch(() => []);
  const message = validation.map((text) => text.trim()).filter(Boolean).join(" / ");
  if (message) throw new Error(`エステ魂で保存できませんでした：${message.slice(0, 200)}`);

  // 開き直して確かめる
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const after = await readFields(page, names);
  const wrong = names.filter((name) => after[name] !== fields[name]);
  if (wrong.length) throw new Error(`保存後も値が変わっていません（${wrong.join("・")}）`);
  return { changed: true, before, after };
}

export async function syncEstamaStoreContact(client: SupabaseClient, runToken: string, connection: Connection) {
  if (!connection.browserbase_context_id) throw new LoginRequiredError("Browserbaseの保存済みログイン情報がありません");
  const { data, error } = await client.rpc("start_store_contact_sync", { p_run_token: runToken, p_target: "estama" });
  if (error) throw new Error(`開始できませんでした：${error.message}`);
  if (!data) return { status: "skipped", reason: "nothing-pending" };
  const values = (data as { values: StoreContactValues }).values;
  const finish = async (status: "done" | "failed" | "review_required", result: unknown, message?: string) => {
    const { error: finishError } = await client.rpc("finish_store_contact_sync", {
      p_run_token: runToken, p_target: "estama", p_status: status, p_result: result ?? {}, p_error: message ?? null,
    });
    if (finishError) console.error(JSON.stringify({ level: "error", msg: "store_contact_finish_failed", error: finishError.message }));
  };

  const plan = estamaContactPlan(values);
  const { bb, session } = await createBrowserSession(connection.browserbase_context_id, false, { action: "store-contact", storeId: connection.store_id });
  try {
    const { browser, page } = await connectSession(session.connectUrl);
    try {
      page.setDefaultTimeout(20_000);
      page.on("dialog", (dialog) => void dialog.accept().catch(() => undefined));
      const contact = await fillAndSave(page, CONTACT_URL, plan.contact);
      const info = await fillAndSave(page, INFO_URL, plan.info);
      const result = { contactChanged: contact.changed, infoChanged: info.changed, fields: [...Object.keys(plan.contact), ...Object.keys(plan.info)] };
      await finish("done", result);
      return { status: "done", ...result };
    } finally {
      await disconnect(browser);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (caught instanceof LoginRequiredError) await finish("failed", {}, "エステ魂のログインが切れています（自動で再ログインしてからやり直します）");
    else await finish(/画面が変わった|見つかりません/.test(message) ? "review_required" : "failed", {}, message.slice(0, 500));
    throw caught;
  } finally {
    await releaseSession(bb, session.id).catch(() => undefined);
  }
}
