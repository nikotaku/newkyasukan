import { createClient } from "@supabase/supabase-js";
import type { Page } from "playwright-core";
import {
  ESTAMA_CAST_EDIT_URL,
  LoginRequiredError,
  connectSession,
  createBrowserSession,
  disconnect,
  ensureAdminLogin,
  releaseSession,
  type Connection,
} from "./estama-automation.js";

/**
 * エステ魂管理画面の「スカウト求人」を自動化するための処理。
 * 今は画面の作りを確かめる読み取り専用の調査（inspect）だけを持つ。
 * 送信処理は実際の画面構造を確認してから足す（推測で押して誤送信しないため）。
 *
 * Vercelには管理鍵を置かない。pg_cron などが発行した一回限りのトークンを
 * claim_estama_scout_run で実行トークンに換え、DB操作はその実行トークン付きのRPCだけで行う。
 */

const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || "https://imrxzkivwrkqbhqfbbes.supabase.co";
const PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || "sb_publishable_T0a9mtOIbupU5n_VAe9caw_xlnbbWfB";

const createPublicClient = () => createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ClaimedRun = {
  runToken?: string;
  storeId?: string;
  connection?: Connection;
  deferred?: boolean;
  unavailable?: boolean;
  reason?: string;
};

type RequestLike = { method?: string; body?: unknown };
type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

const SCOUT_WORDS = /スカウト|scout|求人|recruit|求職|応募/i;

function parseBody(value: unknown) {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function readLinks(page: Page) {
  return page.locator("a[href]").evaluateAll((elements) => elements.map((element) => ({
    text: (element.textContent || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80),
    href: (element as HTMLAnchorElement).href,
  })));
}

/** 1ページ分の構造（見出し・リンク・フォーム・スカウト関連のボタン・ダイアログ・候補カード）を読む */
async function outlinePage(page: Page) {
  return page.evaluate(() => {
    const clean = (value: string | null | undefined, max = 200) =>
      (value || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element: Element) => {
      const html = element as HTMLElement;
      const style = window.getComputedStyle(html);
      return html.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const attrs = (element: Element) => Object.fromEntries(Array.from(element.attributes)
      .filter((attribute) => /^(?:id|class|name|type|value|href|action|method|onclick|role|for|data-.+|aria-.+|formaction|target)$/.test(attribute.name))
      .map((attribute) => [attribute.name, attribute.value.slice(0, 240)]));
    const skeleton = (element: Element, depth = 0): string => {
      if (depth > 7) return "";
      const tag = element.tagName.toLowerCase();
      const a = attrs(element);
      const attrText = Object.entries(a).map(([key, value]) => `${key}="${value}"`).join(" ");
      const children = Array.from(element.children).slice(0, 25).map((child) => skeleton(child, depth + 1)).join("");
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => clean(node.textContent, 40))
        .filter(Boolean)
        .join("|");
      return `<${tag}${attrText ? ` ${attrText}` : ""}>${ownText ? `«${ownText}»` : ""}${children}</${tag}>`;
    };
    const actionLabel = (element: Element) => clean(
      element instanceof HTMLInputElement ? element.value : element.textContent,
      60,
    );

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,legend,.title,.ttl"))
      .map((element) => clean(element.textContent, 80)).filter(Boolean).slice(0, 40);

    const forms = Array.from(document.querySelectorAll("form")).slice(0, 15).map((form) => ({
      attrs: attrs(form),
      visible: visible(form),
      fields: Array.from(form.querySelectorAll("input,select,textarea")).slice(0, 60).map((field) => ({
        tag: field.tagName.toLowerCase(),
        type: (field as HTMLInputElement).type || "",
        name: field.getAttribute("name") || "",
        id: field.id || "",
        placeholder: field.getAttribute("placeholder") || "",
        valueLength: ((field as HTMLInputElement).value || "").length,
        value: ["hidden", "submit", "button", "radio", "checkbox"].includes((field as HTMLInputElement).type)
          ? ((field as HTMLInputElement).value || "").slice(0, 60)
          : undefined,
        checked: (field as HTMLInputElement).checked || undefined,
        options: field instanceof HTMLSelectElement
          ? Array.from(field.options).slice(0, 20).map((option) => `${option.value}:${clean(option.textContent, 30)}`)
          : undefined,
        label: clean(field.closest("label")?.textContent
          || (field.id ? document.querySelector(`label[for="${field.id}"]`)?.textContent : "")
          || "", 40),
        visible: visible(field),
      })),
      buttons: Array.from(form.querySelectorAll("button,input[type=submit],input[type=button]"))
        .map((button) => actionLabel(button)).filter(Boolean).slice(0, 20),
    }));

    const actions = Array.from(document.querySelectorAll("a,button,input[type=submit],input[type=button],[role=button],[onclick]"))
      .filter((element) => /スカウト|送信|送る|テンプレ|一括|次へ|検索|絞り込|もっと|ページ/.test(actionLabel(element)))
      .slice(0, 60)
      .map((element) => ({
        label: actionLabel(element),
        tag: element.tagName.toLowerCase(),
        attrs: attrs(element),
        visible: visible(element),
      }));

    const dialogs = Array.from(document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"],.modal,.popup,.remodal,[class*="modal"]'))
      .slice(0, 10)
      .map((element) => ({
        attrs: attrs(element),
        visible: visible(element),
        text: clean((element as HTMLElement).innerText || element.textContent, 400),
        skeleton: skeleton(element).slice(0, 4_000),
      }));

    // スカウトボタンを1つだけ含む最小の要素を「候補カード」とみなす
    const scoutActions = Array.from(document.querySelectorAll("a,button,input[type=submit],input[type=button],[role=button]"))
      .filter((element) => /スカウト/.test(actionLabel(element)));
    const cards: Element[] = [];
    for (const action of scoutActions) {
      let node: Element | null = action.parentElement;
      while (node && node !== document.body) {
        const count = scoutActions.filter((other) => node!.contains(other)).length;
        const text = clean((node as HTMLElement).innerText, 2_000);
        if (count > 1) break;
        if (text.length > 40) {
          if (!cards.includes(node)) cards.push(node);
          break;
        }
        node = node.parentElement;
      }
    }

    return {
      url: location.href,
      title: document.title,
      headings,
      bodyText: clean(document.body.innerText, 3_000),
      forms,
      actions,
      dialogs,
      scoutActionCount: scoutActions.length,
      scoutActionLabels: [...new Set(scoutActions.map((element) => actionLabel(element)))].slice(0, 10),
      cardCount: cards.length,
      cards: cards.slice(0, 2).map((card) => ({
        text: clean((card as HTMLElement).innerText, 500),
        skeleton: skeleton(card).slice(0, 6_000),
      })),
    };
  });
}

export async function inspectEstamaScoutPages(connection: Connection) {
  if (!connection.browserbase_context_id) {
    throw new LoginRequiredError("Browserbaseの保存済みログイン情報がありません");
  }
  const { bb, session } = await createBrowserSession(
    connection.browserbase_context_id,
    false,
    { action: "scout-inspect", storeId: connection.store_id },
    { solveCaptchas: false },
  );
  try {
    const { browser, page } = await connectSession(session.connectUrl);
    try {
      page.setDefaultTimeout(10_000);
      await page.goto(ESTAMA_CAST_EDIT_URL, { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page, "#Name");
      const adminLinks = await readLinks(page);
      await page.goto("https://estama.jp/admin/", { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);
      const topLinks = await readLinks(page);

      const allLinks = [...adminLinks, ...topLinks]
        .filter((link) => /^https:\/\/(?:www\.)?estama\.jp\//.test(link.href))
        .filter((link, index, list) => list.findIndex((other) => other.href === link.href && other.text === link.text) === index);
      const menu = allLinks
        .filter((link) => /\/admin\//.test(link.href))
        .map((link) => `${link.text} → ${link.href.replace("https://estama.jp", "")}`)
        .slice(0, 200);
      const scoutLinks = allLinks.filter((link) => SCOUT_WORDS.test(`${link.text} ${link.href}`));

      const targets = [...new Set(scoutLinks
        .filter((link) => /スカウト|scout/i.test(`${link.text} ${link.href}`))
        .map((link) => link.href)
        .filter((href) => /\/admin\//.test(href)))].slice(0, 3);
      // メニューから見つからないときは、ありそうなURLを開いてみる（読むだけ）
      if (!targets.length) targets.push("https://estama.jp/admin/scout/", "https://estama.jp/admin/recruit/scout/");

      const pages = [];
      for (const target of targets) {
        await page.goto(target, { waitUntil: "domcontentloaded" });
        await ensureAdminLogin(page);
        await page.waitForTimeout(1_000);
        const outline = await outlinePage(page);
        const subLinks = (await readLinks(page))
          .filter((link) => /スカウト|scout|テンプレ|履歴|検索/i.test(`${link.text} ${link.href}`))
          .map((link) => `${link.text} → ${link.href.replace("https://estama.jp", "")}`)
          .filter((value, index, list) => list.indexOf(value) === index)
          .slice(0, 40);
        pages.push({ target, subLinks, ...outline });
      }
      return { menu, scoutLinks, pages };
    } finally {
      await disconnect(browser);
    }
  } finally {
    await releaseSession(bb, session.id);
  }
}

/** スカウト小窓の中身・検索条件・結果ページを読む（小窓は開くだけで、中のボタンは押さない） */
export async function inspectEstamaScoutDetail(connection: Connection) {
  if (!connection.browserbase_context_id) {
    throw new LoginRequiredError("Browserbaseの保存済みログイン情報がありません");
  }
  const { bb, session } = await createBrowserSession(
    connection.browserbase_context_id,
    false,
    { action: "scout-inspect-detail", storeId: connection.store_id },
    { solveCaptchas: false },
  );
  try {
    const { browser, page } = await connectSession(session.connectUrl);
    const requests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!/estama\.jp/.test(url) || /\.(?:png|jpe?g|gif|webp|svg|css|woff2?)(?:\?|$)/i.test(url)) return;
      const post = request.postData() || "";
      requests.push(`${request.method()} ${url.replace("https://estama.jp", "")}${post ? ` body=${post.slice(0, 400)}` : ""}`);
    });
    try {
      page.setDefaultTimeout(10_000);
      await page.goto("https://estama.jp/admin/esjob/", { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);
      await page.waitForTimeout(1_000);

      // 小窓を開く仕組み（send-get_modal）をページのスクリプトから探す
      const scripts = await page.evaluate(async () => {
        const hits: string[] = [];
        const pick = (source: string, label: string) => {
          for (const word of ["get_modal", "send-", "esjob", "scout", "resume"]) {
            let index = source.indexOf(word);
            let count = 0;
            while (index >= 0 && count < 4) {
              hits.push(`[${label}] ${source.slice(Math.max(0, index - 300), index + 700)}`);
              index = source.indexOf(word, index + 700);
              count += 1;
            }
          }
        };
        for (const script of Array.from(document.querySelectorAll("script"))) {
          if (script.src) {
            if (!/estama\.jp|^\//.test(script.src) || /jquery|bootstrap|google|gtag|analytics/i.test(script.src)) continue;
            try {
              const text = await (await fetch(script.src, { credentials: "same-origin" })).text();
              pick(text, script.src.replace(location.origin, ""));
            } catch { /* 読めないものは飛ばす */ }
          } else {
            pick(script.textContent || "", "inline");
          }
        }
        return [...new Set(hits)].slice(0, 30).map((hit) => hit.slice(0, 1_000));
      });

      const readModal = async () => page.evaluate(() => {
        const clean = (value: string | null | undefined, max = 200) =>
          (value || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
        const visible = (element: Element) => {
          const html = element as HTMLElement;
          const style = window.getComputedStyle(html);
          return html.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const attrs = (element: Element) => Object.fromEntries(Array.from(element.attributes)
          .filter((attribute) => /^(?:id|class|name|type|value|href|action|method|onclick|role|for|data-.+|aria-.+|formaction|target|disabled|checked|selected)$/.test(attribute.name))
          .map((attribute) => [attribute.name, attribute.value.slice(0, 240)]));
        const skeleton = (element: Element, depth = 0): string => {
          if (depth > 9) return "";
          const tag = element.tagName.toLowerCase();
          if (tag === "script" || tag === "style" || tag === "svg") return "";
          const a = attrs(element);
          const attrText = Object.entries(a).map(([key, value]) => `${key}="${value}"`).join(" ");
          const children = Array.from(element.children).slice(0, 40).map((child) => skeleton(child, depth + 1)).join("");
          const ownText = Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => clean(node.textContent, 60))
            .filter(Boolean)
            .join("|");
          return `<${tag}${attrText ? ` ${attrText}` : ""}>${ownText ? `«${ownText}»` : ""}${children}</${tag}>`;
        };
        const modals = Array.from(document.querySelectorAll('.modal, [role="dialog"], dialog, .remodal, [class*="modal"]'))
          .filter((element) => visible(element) && !element.classList.contains("send-get_modal"))
          .filter((element, index, list) => !list.some((other) => other !== element && other.contains(element)));
        return modals.slice(0, 3).map((modal) => ({
          attrs: attrs(modal),
          text: clean((modal as HTMLElement).innerText, 1_500),
          skeleton: skeleton(modal).slice(0, 12_000),
          forms: Array.from(modal.querySelectorAll("form")).map((form) => ({
            attrs: attrs(form),
            fields: Array.from(form.querySelectorAll("input,select,textarea,button")).slice(0, 60).map((field) => ({
              tag: field.tagName.toLowerCase(),
              attrs: attrs(field),
              label: clean(field instanceof HTMLInputElement ? field.value : field.textContent, 60),
              options: field instanceof HTMLSelectElement
                ? Array.from(field.options).slice(0, 20).map((option) => `${option.value}:${clean(option.textContent, 40)}`)
                : undefined,
              visible: visible(field),
            })),
          })),
        }));
      });

      const closeModal = async () => {
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(500);
        const close = page.locator('.modal:visible [data-dismiss="modal"], .modal:visible .close, .modal:visible button:has-text("閉じる")').first();
        if (await close.count()) await close.click({ timeout: 3_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
      };

      const modals: Record<string, unknown> = {};
      for (const [key, selector] of [
        ["scouted", "a.btn-danger[data-row^='resume,']"],
        ["notScouted", "a.btn.send-get_modal[data-row^='resume,']"],
      ] as const) {
        const button = page.locator(selector).first();
        if (!await button.count()) {
          modals[key] = "ボタンなし";
          continue;
        }
        const row = await button.getAttribute("data-row");
        const before = requests.length;
        await button.click({ timeout: 10_000 });
        await page.waitForTimeout(2_500);
        modals[key] = { row, requests: requests.slice(before), modal: await readModal() };
        await closeModal();
      }

      const others: Record<string, unknown> = {};
      for (const target of ["https://estama.jp/admin/esjob_search/", "https://estama.jp/admin/esjob_offer/"]) {
        await page.goto(target, { waitUntil: "domcontentloaded" });
        await ensureAdminLogin(page);
        await page.waitForTimeout(800);
        const outline = await outlinePage(page);
        const text = outline.bodyText;
        const start = Math.max(0, text.indexOf("エスジョブユーザー検索") >= 0 ? text.lastIndexOf("エスジョブユーザー検索") : 0);
        others[target.replace("https://estama.jp", "")] = {
          headings: outline.headings,
          bodyText: text.slice(start, start + 2_500),
          forms: outline.forms,
          actions: outline.actions.filter((action) => !/^\/admin\/(?!esjob)/.test(String(action.attrs.href || ""))).slice(0, 30),
        };
      }
      return { scripts, modals, others, requests: requests.slice(0, 60) };
    } finally {
      await disconnect(browser);
    }
  } finally {
    await releaseSession(bb, session.id);
  }
}

/** /api/cron/estama-appeal?action=estama-scout（pg_cronなどが一回限りのトークン付きで呼ぶ） */
export async function handleEstamaScoutRequest(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "private, no-store");
  let body: Record<string, unknown>;
  try {
    body = parseBody(req.body);
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9a-f]{64}$/.test(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const client = createPublicClient();
  let runToken = "";
  try {
    const { data, error: claimError } = await client.rpc("claim_estama_scout_run", { p_token: token });
    if (claimError) throw claimError;
    const claimed = (data || null) as ClaimedRun | null;
    if (!claimed?.storeId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (claimed.deferred || claimed.unavailable || !claimed.runToken || !claimed.connection) {
      res.status(409).json({ ok: false, storeId: claimed.storeId, deferred: Boolean(claimed.deferred), reason: claimed.reason });
      return;
    }
    runToken = claimed.runToken;
    const mode = typeof body.mode === "string" ? body.mode : "inspect";
    if (mode !== "inspect" && mode !== "inspect-detail") {
      res.status(400).json({ error: "未対応の操作です" });
      return;
    }
    const result = mode === "inspect-detail"
      ? await inspectEstamaScoutDetail(claimed.connection)
      : await inspectEstamaScoutPages(claimed.connection);
    res.status(200).json({ ok: true, storeId: claimed.storeId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", msg: "estama_scout_failed", error: message }));
    res.status(error instanceof LoginRequiredError ? 409 : 500).json({ error: message });
  } finally {
    if (runToken) await client.rpc("release_estama_scout_run", { p_run_token: runToken });
  }
}
