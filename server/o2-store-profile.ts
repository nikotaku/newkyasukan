// O2 の店舗アカウント（https://m-sns.net/shop/…）の店舗プロフィール。
//   inspect … ログインして、指定したページのフォームの欄の名前・種類だけを読む（値は返さない・読むだけ）
// 呼び出しは estama-scout の mode `o2-inspect`（実行トークンで店舗を確かめ、RPC get_o2_store_login_for_run でログイン情報を受け取る）
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreContactValues } from "./estama-store-contact-plan.js";
import { applyO2Contact, o2ContactPlan, o2FormEntries, sameO2Value, unexpectedO2Changes } from "./o2-store-contact-plan.js";
import { O2_BASE, fieldsFrom, formsFrom, hiddenFields, o2StoreFormError } from "./o2-store-post-page.js";
import { CookieJar, O2_STORE_LOGIN_URL, follow, isO2StoreLoginPage, request } from "./o2-store-availability.js";

export async function loginO2Store(email: string, password: string) {
  const jar = new CookieJar();
  const loginPage = await request(jar, O2_STORE_LOGIN_URL);
  const loginHtml = await loginPage.text();
  const loginForm = formsFrom(loginHtml, O2_STORE_LOGIN_URL).find((form) => /name=["']email["']/i.test(form.html) && /type=["']password/i.test(form.html));
  if (!loginForm) throw new Error("O2店舗ログインフォームが見つかりません（画面仕様変更の可能性）");
  const body = new URLSearchParams();
  for (const [name, value] of hiddenFields(loginForm.html)) body.set(name, value);
  body.set("email", email);
  body.set("password", password);
  let response = await request(jar, loginForm.action, {
    method: loginForm.method,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: O2_STORE_LOGIN_URL },
    body: body.toString(),
  });
  response = await follow(jar, response, loginForm.action);
  const html = await response.text();
  if (response.status >= 400 || isO2StoreLoginPage(html)) throw new Error("O2店舗へログインできません。メールアドレス・パスワードを確認してください");
  return { jar, html, url: response.url || O2_BASE };
}

export async function openO2Page(jar: CookieJar, url: string, referer: string) {
  let response = await request(jar, url, { headers: { Referer: referer } });
  response = await follow(jar, response, url);
  const html = await response.text();
  if (isO2StoreLoginPage(html)) throw new Error("O2店舗ログインの有効期限が切れました");
  return { status: response.status, url: response.url || url, html };
}

const shopLinks = (html: string, baseUrl: string) => [...new Set(
  [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const href = new URL(match[1], baseUrl).toString();
      const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30);
      return href.startsWith(`${O2_BASE}/shop/`) ? `${text} → ${href.replace(O2_BASE, "")}` : "";
    })
    .filter(Boolean),
)].slice(0, 80);

/** 指定したページのフォームの作り（欄の名前・種類・値の長さ）。値そのものは返さない */
export async function inspectO2StorePages(email: string, password: string, paths: string[]) {
  const { jar, html, url } = await loginO2Store(email, password);
  const pages = [{ path: "(ログイン直後)", url: url.replace(O2_BASE, ""), links: shopLinks(html, url), forms: [] as unknown[] }];
  for (const path of paths.slice(0, 6)) {
    if (!/^\/shop\/[\w\-/]*$/.test(path)) continue;
    try {
      const page = await openO2Page(jar, `${O2_BASE}${path}`, url);
      const title = (page.html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 80);
      const forms = formsFrom(page.html, page.url).map((form) => ({
        action: form.action.replace(O2_BASE, ""),
        method: form.method,
        fields: [
          ...fieldsFrom(form.html, "input").map((field) => ({ tag: "input", name: field.name, type: field.type || "text", valueLength: (field.value || "").length, placeholder: (field.placeholder || "").slice(0, 40) })),
          ...fieldsFrom(form.html, "textarea").map((field) => ({ tag: "textarea", name: field.name, type: "textarea", valueLength: 0, placeholder: (field.placeholder || "").slice(0, 40) })),
          ...[...form.html.matchAll(/<select\b([^>]*)>/gi)].map((match) => ({ tag: "select", name: (match[1].match(/name=["']([^"']+)/)?.[1] ?? ""), type: "select", valueLength: 0, placeholder: "" })),
        ].filter((field) => field.name && !/password|csrf|token/i.test(field.name) || field.type === "hidden"),
        labels: [...form.html.matchAll(/<(?:label|th|dt|h\d)\b[^>]*>([\s\S]*?)<\/(?:label|th|dt|h\d)>/gi)]
          .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40),
      }));
      pages.push({ path, url: page.url.replace(O2_BASE, ""), links: [`${title}`, ...shopLinks(page.html, page.url)], forms });
    } catch (error) {
      pages.push({ path, url: "", links: [`エラー：${error instanceof Error ? error.message : String(error)}`], forms: [] });
    }
  }
  return { pages };
}

// ---- 連絡先・SNS（正本）を O2 の店舗情報編集へ書き換える ----
//   pg_cron（private.dispatch_store_contact_sync）→ estama-scout の mode `o2-contact`
//   1. RPC start_store_contact_sync（target = o2）で正本の値を受け取る
//   2. /shop/profile/ を開き、フォームの今の中身をそのまま送り直す（電話・X・LINEだけ入れ替える。ロゴ・説明・エリアなどはそのまま）
//   3. 開き直して、連絡先が入った・ほかの欄が変わっていないことを確かめ、RPC finish_store_contact_sync に記録（自動化履歴にも残る）

const O2_PROFILE_URL = `${O2_BASE}/shop/profile/`;

const profileForm = (html: string, url: string) => formsFrom(html, url)
  .find((form) => /name=["']shop_name["']/i.test(form.html) && /name=["']phone["']/i.test(form.html));

export class O2ContactReviewError extends Error {}

export async function syncO2StoreContact(client: SupabaseClient, runToken: string) {
  const { data, error } = await client.rpc("start_store_contact_sync", { p_run_token: runToken, p_target: "o2" });
  if (error) throw new Error(`開始できませんでした：${error.message}`);
  if (!data) return { status: "skipped", reason: "nothing-pending" };
  const values = (data as { values: StoreContactValues }).values;
  const finish = async (status: "done" | "failed" | "review_required", result: unknown, message?: string) => {
    const { error: finishError } = await client.rpc("finish_store_contact_sync", {
      p_run_token: runToken, p_target: "o2", p_status: status, p_result: result ?? {}, p_error: message ?? null,
    });
    if (finishError) console.error(JSON.stringify({ level: "error", msg: "o2_contact_finish_failed", error: finishError.message }));
  };

  try {
    const { data: login, error: loginError } = await client.rpc("get_o2_store_login_for_run", { p_run_token: runToken });
    if (loginError || !login?.login_id || !login?.password) throw new O2ContactReviewError("O2の店舗アカウントのログイン情報がありません（SNS連携で登録してください）");
    const plan = o2ContactPlan(values);
    const fields = Object.keys(plan);
    const { jar, url: home } = await loginO2Store(login.login_id, login.password);
    const page = await openO2Page(jar, O2_PROFILE_URL, home);
    const form = profileForm(page.html, page.url);
    if (!form) throw new O2ContactReviewError("O2の店舗情報編集のフォームが見つかりません（画面が変わった可能性）");
    const before = o2FormEntries(form.html);
    const current = new Map(before);
    if (fields.every((name) => sameO2Value(name, current.get(name), plan[name]))) {
      const result = { fields, changed: false };
      await finish("done", result);
      return { status: "done", ...result };
    }
    const { entries, missing } = applyO2Contact(before, plan);
    if (missing.length) throw new O2ContactReviewError(`O2の画面に欄が見つかりません（${missing.join("・")}）。画面が変わった可能性があります`);

    const body = new FormData();
    for (const [name, value] of entries) body.append(name, value);
    let submitted = await request(jar, form.action, { method: "POST", headers: { Referer: page.url }, body });
    submitted = await follow(jar, submitted, form.action);
    const responseHtml = await submitted.text();
    if (submitted.status >= 400) throw new Error(`O2で保存できませんでした（HTTP ${submitted.status}）`);
    if (isO2StoreLoginPage(responseHtml)) throw new Error("O2店舗ログインの有効期限が切れました");

    const reopened = await openO2Page(jar, O2_PROFILE_URL, page.url);
    const afterForm = profileForm(reopened.html, reopened.url);
    if (!afterForm) throw new O2ContactReviewError("保存後にO2の店舗情報編集を開けませんでした（反映を確認してください）");
    const after = o2FormEntries(afterForm.html);
    const saved = new Map(after);
    const wrong = fields.filter((name) => !sameO2Value(name, saved.get(name), plan[name]));
    if (wrong.length) {
      const reason = o2StoreFormError(responseHtml);
      throw new Error(`O2で保存後も値が変わっていません（${wrong.join("・")}）${reason ? `：${reason}` : ""}`);
    }
    const others = unexpectedO2Changes(before, after, plan);
    const result = { fields, changed: true, ...(others.length ? { otherChanged: others } : {}) };
    if (others.length) {
      await finish("review_required", result, `連絡先は入りましたが、ほかの欄も変わりました（${others.join("・")}）。O2の店舗情報編集を確認してください`);
      return { status: "review_required", ...result };
    }
    await finish("done", result);
    return { status: "done", ...result };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await finish(caught instanceof O2ContactReviewError ? "review_required" : "failed", {}, message.slice(0, 500));
    throw caught;
  }
}
