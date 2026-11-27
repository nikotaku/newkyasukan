// O2 の店舗アカウント（https://m-sns.net/shop/…）の店舗プロフィール。
//   inspect … ログインして、指定したページのフォームの欄の名前・種類だけを読む（値は返さない・読むだけ）
// 呼び出しは estama-scout の mode `o2-inspect`（実行トークンで店舗を確かめ、RPC get_o2_store_login_for_run でログイン情報を受け取る）
import { O2_BASE, fieldsFrom, formsFrom, hiddenFields } from "./o2-store-post-page.js";
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
