// メンエスなう（men-esthe.co.jp）の店舗管理画面を、日本のプロキシ経由で開いて構成を読む（読むだけ。保存・投稿はしない）
// 同時投稿を組む前に、管理画面のメニュー・投稿フォームの項目を確かめるためのもの。
// サイトは日本以外のIPから開けないため、Browserbase の日本のプロキシを通す。
// ログイン情報は「店舗の投稿先 › その他の媒体」に登録したもの（パスワードは Vault）を、操作した店長・オーナーの権限で読む。
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "playwright-core";
import { connectSession, createBrowserSession, disconnect, releaseSession } from "./estama-automation.js";
import {
  classifyMenesnowLogin,
  findMenesnowChannel,
  MENESNOW_DOMAINS,
  MENESNOW_ORIGIN,
  menesnowLoginUrl,
  menesnowStoreId,
  normalizeMenesnowLinks,
  scrubJson,
} from "./menesnow-utils.js";

type Channel = {
  id: string; platform: string; label: string; login_url: string | null; login_id: string | null;
  handle: string | null; password_configured: boolean;
};

type PageSnapshot = {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ text: string; path: string }>;
  forms: Array<{
    action: string; method: string; enctype: string;
    fields: Array<{ tag: string; type: string; name: string; id: string; label: string; required: boolean; accept: string; options: string[] }>;
    buttons: string[];
  }>;
  text: string;
  screenshot: string | null;
};

const MAX_PAGES = 6;

async function waitForCloudflare(page: Page) {
  for (let i = 0; i < 20; i += 1) {
    const title = await page.title().catch(() => "");
    if (!/just a moment|しばらくお待ちください|attention required/i.test(title)) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

async function snapshot(page: Page): Promise<PageSnapshot> {
  const data = await page.evaluate(() => {
    const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
    const labelOf = (el: Element) => {
      const id = el.getAttribute("id");
      const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrap = el.closest("label");
      const group = el.closest(".form-group, .field, tr, li, div");
      return clean(byFor?.textContent || wrap?.textContent || group?.querySelector("label, th, .label")?.textContent || el.getAttribute("placeholder") || el.getAttribute("aria-label")).slice(0, 80);
    };
    return {
      title: document.title,
      headings: Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => clean(h.textContent)).filter(Boolean).slice(0, 40),
      links: Array.from(document.querySelectorAll("a[href]")).map((a) => ({ text: clean(a.textContent || a.getAttribute("title")), href: (a as HTMLAnchorElement).href })),
      forms: Array.from(document.querySelectorAll("form")).slice(0, 15).map((form) => ({
        action: form.getAttribute("action") || "",
        method: (form.getAttribute("method") || "get").toLowerCase(),
        enctype: form.getAttribute("enctype") || "",
        // 値は読まない（CSRFトークン・入力済みの内容を外に出さない）
        fields: Array.from(form.querySelectorAll("input, textarea, select")).slice(0, 60).map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.getAttribute("id") || "",
          label: el.getAttribute("type") === "hidden" ? "" : labelOf(el),
          required: el.hasAttribute("required"),
          accept: el.getAttribute("accept") || "",
          options: el.tagName === "SELECT" ? Array.from((el as HTMLSelectElement).options).slice(0, 30).map((o) => clean(o.textContent)) : [],
        })),
        buttons: Array.from(form.querySelectorAll("button, input[type=submit]")).map((b) => clean(b.textContent || b.getAttribute("value"))).filter(Boolean).slice(0, 10),
      })),
      text: clean(document.body?.innerText).slice(0, 3000),
    };
  });
  const shot = await page.screenshot({ type: "jpeg", quality: 45, fullPage: true }).catch(() => null);
  return {
    url: page.url(),
    title: data.title,
    headings: data.headings,
    links: normalizeMenesnowLinks(data.links),
    forms: data.forms,
    text: data.text,
    // 大きすぎる画像は返さない（Vercel の応答上限）
    screenshot: shot && shot.length < 1_200_000 ? `data:image/jpeg;base64,${shot.toString("base64")}` : null,
  };
}

async function login(page: Page, url: string, loginId: string, password: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!(await waitForCloudflare(page))) {
    return classifyMenesnowLogin({ url: page.url(), hasPasswordField: false, errorText: "", blocked: true });
  }
  const pass = page.locator('input[type="password"]').first();
  if (!(await pass.count())) {
    // すでにログイン済み、または画面が開けなかった
    const status = await page.title();
    if (/404|not found/i.test(status)) {
      return classifyMenesnowLogin({ url: page.url(), hasPasswordField: false, errorText: "", blocked: true });
    }
    return classifyMenesnowLogin({ url: page.url(), hasPasswordField: false, errorText: "", blocked: false });
  }
  const form = page.locator("form").filter({ has: page.locator('input[type="password"]') }).first();
  const user = form.locator('input[name="username"], input[name="login"], input[name="email"], input[type="email"], input[type="text"]').first();
  if (!(await user.count())) {
    return { ok: false as const, error: "ログイン画面のID欄が見つかりません（画面が変わった可能性があります）" };
  }
  await user.fill(loginId);
  await pass.fill(password);
  const submit = form.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
  await Promise.all([
    page.waitForURL((current) => !/\/accounts\/login/.test(current.pathname), { timeout: 25_000 }).catch(() => null),
    (await submit.count()) ? submit.click() : pass.press("Enter"),
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => null);
  await waitForCloudflare(page);
  const errorText = await page.locator(".errorlist, .alert-danger, .alert-error, .error, .invalid-feedback, [role=alert]")
    .allInnerTexts().then((texts) => texts.join(" ")).catch(() => "");
  return classifyMenesnowLogin({
    url: page.url(),
    hasPasswordField: (await page.locator('input[type="password"]').count()) > 0,
    errorText,
    blocked: false,
  });
}

/** 店長・オーナーの権限（admin = その人のJWTのクライアント）で、メンエスなうの管理画面を読む */
export async function inspectMenesnow(admin: SupabaseClient, storeId: string, requestedPaths: string[] = []) {
  const { data: channels, error } = await admin.rpc("get_store_post_channels", { p_store_id: storeId });
  if (error) throw new Error(error.message);
  const channel = findMenesnowChannel((channels || []) as Channel[]);
  if (!channel) {
    return { ok: false, error: "「店舗の投稿先 › その他の媒体」にメンエスなう（ログイン画面のURLが men-esthe.co.jp）を登録してください" };
  }
  if (!channel.login_id || !channel.password_configured) {
    return { ok: false, error: "メンエスなうのログインID・パスワードを登録してください" };
  }
  const { data: password, error: revealError } = await admin.rpc("reveal_store_post_channel_password", { p_channel_id: channel.id });
  if (revealError) throw new Error(revealError.message);
  if (typeof password !== "string" || !password) return { ok: false, error: "メンエスなうのパスワードが空です" };

  const secrets = [password, channel.login_id];
  const shopId = menesnowStoreId(channel.login_url, channel.handle);
  const paths = requestedPaths
    .map((p) => p.trim())
    .filter((p) => /^\/manage\/[\w\-/?=&.%]*$/.test(p))
    .slice(0, MAX_PAGES - 1);

  let bb: Awaited<ReturnType<typeof createBrowserSession>>["bb"] | null = null;
  let sessionId = "";
  const pages: PageSnapshot[] = [];
  let result: { ok: boolean; error?: string };
  try {
    const created = await createBrowserSession(null, false, { action: "menesnow-inspect", storeId }, {
      solveCaptchas: true,
      proxyCountry: "JP",
      allowedDomains: [...MENESNOW_DOMAINS, "challenges.cloudflare.com"],
      integration: "newkyasukan-menesnow",
    });
    bb = created.bb;
    sessionId = created.session.id;
    const { browser, page } = await connectSession(created.session.connectUrl);
    try {
      result = await login(page, menesnowLoginUrl(shopId), channel.login_id, password);
      if (result.ok) {
        pages.push(await snapshot(page));
        const targets = paths.length ? paths : (shopId ? [`/manage/store/${shopId}/`] : []);
        for (const path of targets) {
          if (pages.some((p) => new URL(p.url).pathname === path.split("?")[0])) continue;
          await page.goto(`${MENESNOW_ORIGIN}${path}`, { waitUntil: "domcontentloaded" }).catch(() => null);
          await waitForCloudflare(page);
          pages.push(await snapshot(page));
        }
      } else {
        pages.push(await snapshot(page).catch(() => ({ url: page.url(), title: "", headings: [], links: [], forms: [], text: "", screenshot: null })));
      }
    } finally {
      await disconnect(browser);
    }
  } catch (err) {
    result = { ok: false, error: `メンエスなうを開けませんでした：${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (bb && sessionId) await releaseSession(bb, sessionId).catch(() => null);
  }

  // 画面の文字・URLにログイン情報が混ざっていても外に出さない
  const scrubbed = JSON.parse(scrubJson(JSON.stringify({ result, pages }), secrets)) as { result: { ok: boolean; error?: string }; pages: PageSnapshot[] };
  return { ok: scrubbed.result.ok, error: scrubbed.result.error, channelLabel: channel.label, shopId, pages: scrubbed.pages };
}
