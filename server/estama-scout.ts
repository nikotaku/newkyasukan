import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
import {
  parseAgeGender,
  selectScoutCandidates,
  type ScoutListEntry,
} from "../src/lib/estamaScout.js";

/**
 * エステ魂管理画面の「スカウト求人」（エスジョブ）を自動化する処理。
 *  - collect: スカウト求人・スカウト検索の一覧から候補を読み、DBに保存して OK待ち にする（読むだけ）
 *  - send:    OKが出た人だけ、履歴書の小窓を開いてスカウトテンプレートで送信する
 *  - inspect / inspect-detail: 画面が変わった時に作りを確かめる読み取り専用の調査
 *
 * 画面の作り（2026-09 時点）：候補は a.send-get_modal[data-row="resume,<ID>"]。押すと POST /admin_post/modal/ で
 * 小窓（form#form-scout：select#mail_template・textarea[name=message]・input[name=user_id]）が開き、
 * a.send-modal_post[data-post="scout"]（「スカウトを送信」）で POST /admin_post/scout に送る。返事は ["OK", …] / ["OUT", エラー]。
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

const ESJOB_URL = "https://estama.jp/admin/esjob/";
const ESJOB_SEARCH_URL = "https://estama.jp/admin/esjob_search/";
const SEND_TIME_BUDGET_MS = 200_000;

type ScoutJob = {
  ok: boolean;
  reason?: string;
  dailyCount?: number;
  preferredAreas?: string[];
  onlyPreferred?: boolean;
  excludedIds?: string[];
  message?: string | null;
  templateName?: string | null;
  candidates?: Array<{ id: string; externalId: string; displayName: string | null }>;
};

async function rpcOrThrow<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** 一覧ページの候補カード（data-row="resume,<ID>"）を読む。1人1枚になるよう、他のIDを含まない一番大きい要素をカードとする */
async function readScoutEntries(page: Page, section: string, areaHint = ""): Promise<ScoutListEntry[]> {
  const raw = await page.evaluate(() => {
    const clean = (value: string | null | undefined) => (value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const idOf = (element: Element) => element.getAttribute("data-row")?.match(/^resume,(\d+)$/)?.[1] || "";
    const buttons = Array.from(document.querySelectorAll("[data-row^='resume,']"));
    const ids = [...new Set(buttons.map(idOf).filter(Boolean))];
    return ids.map((id) => {
      const own = buttons.filter((button) => idOf(button) === id);
      let card: Element = own[0];
      let node = card.parentElement;
      while (node && node !== document.body) {
        const other = Array.from(node.querySelectorAll("[data-row^='resume,']")).some((button) => idOf(button) !== id);
        if (other) break;
        card = node;
        node = node.parentElement;
      }
      const text = clean((card as HTMLElement).innerText);
      const scoutButton = own.some((button) => button.classList.contains("btn") && button.classList.contains("send-get_modal"));
      const scouted = !scoutButton
        || own.some((button) => button.classList.contains("btn-danger"))
        || /スカウト済み/.test(text.replace(/\s+/g, ""));
      return {
        id,
        text: text.slice(0, 1_000),
        name: clean(card.querySelector(".user-name")?.textContent),
        age: clean(card.querySelector(".user-age")?.textContent),
        areas: clean(card.querySelector(".users-area")?.textContent),
        scouted,
      };
    });
  });
  return raw.map((item) => {
    const ageText = item.age || item.text;
    const { age, gender } = parseAgeGender(ageText);
    const name = item.name || item.text.split(/[（(]\s*\d{2}\s*歳/)[0].replace(/^選択\s*/, "").trim().slice(0, 40);
    const pr = item.text
      .replace(/^選択\s*/, "")
      .replace(name, "")
      .replace(/[（(]\s*\d{2}\s*歳\s*[男女]?\s*[)）]/, "")
      .replace(item.areas, "")
      .replace(/^選択\s*/, "")
      .replace(/\s*(?:\d+件の他店舗の評価|履歴書\s*&?\s*スカウト|履歴書|スカウト済み|スカウト|検討リスト|に追加|済み)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      externalId: item.id,
      name,
      age,
      gender,
      areas: item.areas || areaHint,
      section,
      scouted: item.scouted,
      summary: pr.slice(0, 300),
    };
  });
}

async function readSearchLinks(page: Page) {
  return page.locator("a[href*='esjob_search']").evaluateAll((elements) => elements.map((element) => ({
    text: (element.textContent || "").normalize("NFKC").replace(/\s+/g, " ").trim(),
    href: (element as HTMLAnchorElement).href,
  })));
}

/** 候補を集めて保存する（読むだけ。スカウトは送らない） */
async function collectScoutCandidates(client: SupabaseClient, runToken: string, batchId: string, connection: Connection) {
  const job = await rpcOrThrow<ScoutJob>(client, "get_estama_scout_job", {
    p_run_token: runToken, p_batch_id: batchId, p_mode: "collect",
  });
  if (!job?.ok) return { skipped: true, reason: job?.reason };
  const dailyCount = job.dailyCount || 10;
  const preferredAreas = job.preferredAreas || [];
  const excludedIds = new Set(job.excludedIds || []);

  const { bb, session } = await createBrowserSession(
    connection.browserbase_context_id,
    false,
    { action: "scout-collect", storeId: connection.store_id },
    { solveCaptchas: false },
  );
  try {
    const { browser, page } = await connectSession(session.connectUrl);
    try {
      page.setDefaultTimeout(15_000);
      const entries: ScoutListEntry[] = [];
      const pagesRead: string[] = [];

      await page.goto(ESJOB_URL, { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);
      entries.push(...await readScoutEntries(page, "新着"));
      pagesRead.push(page.url());

      await page.goto(ESJOB_SEARCH_URL, { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);
      const searchLinks = await readSearchLinks(page);
      // 「エリアから探す」に優先エリアがあれば先に読む
      const areaLinks = searchLinks
        .filter((link) => link.href !== ESJOB_SEARCH_URL && preferredAreas.some((area) => area && link.text.includes(area)))
        .filter((link, index, list) => list.findIndex((other) => other.href === link.href) === index)
        .slice(0, 4);
      entries.push(...await readScoutEntries(page, "検索"));
      pagesRead.push(page.url());
      for (const link of areaLinks) {
        await page.goto(link.href, { waitUntil: "domcontentloaded" });
        await ensureAdminLogin(page);
        entries.unshift(...await readScoutEntries(page, `エリア:${link.text}`, link.text));
        pagesRead.push(page.url());
      }

      // 足りなければ検索結果の次のページへ（最大4ページ）
      const eligibleCount = () => selectScoutCandidates(entries, {
        count: dailyCount, excludedIds, preferredAreas, onlyPreferred: Boolean(job.onlyPreferred),
      }).length;
      await page.goto(ESJOB_SEARCH_URL, { waitUntil: "domcontentloaded" });
      for (let pageNumber = 2; pageNumber <= 5 && eligibleCount() < dailyCount; pageNumber += 1) {
        const next = (await readSearchLinks(page)).find((link) => (
          link.text === String(pageNumber) || /^(?:次へ|次|›|»|>)$/.test(link.text)
        ));
        if (!next) break;
        await page.goto(next.href, { waitUntil: "domcontentloaded" });
        await ensureAdminLogin(page);
        entries.push(...await readScoutEntries(page, `検索${pageNumber}`));
        pagesRead.push(page.url());
      }

      // 同じ人の情報をまとめる（エリアは新着一覧、自己PRは検索ページにある）
      const merged = new Map<string, ScoutListEntry>();
      for (const entry of entries) {
        const previous = merged.get(entry.externalId);
        merged.set(entry.externalId, previous ? {
          ...previous,
          name: previous.name || entry.name,
          age: previous.age || entry.age,
          gender: previous.gender || entry.gender,
          areas: previous.areas || entry.areas,
          summary: previous.summary.length >= entry.summary.length ? previous.summary : entry.summary,
          scouted: previous.scouted || entry.scouted,
        } : entry);
      }
      const all = [...merged.values()];
      const selected = selectScoutCandidates(all, {
        count: dailyCount, excludedIds, preferredAreas, onlyPreferred: Boolean(job.onlyPreferred),
      });

      const result = await rpcOrThrow<{ candidates: number }>(client, "save_estama_scout_candidates", {
        p_run_token: runToken,
        p_batch_id: batchId,
        p_payload: {
          scoutUrl: ESJOB_URL,
          candidates: selected.map((entry) => ({
            externalId: entry.externalId,
            displayName: entry.name || "匿名希望",
            summary: entry.summary || "",
            attributes: {
              age: entry.age,
              gender: entry.gender,
              areas: entry.areas,
              section: entry.section,
              preferred: entry.preferred,
            },
          })),
          diagnostics: {
            pagesRead,
            listed: all.length,
            alreadyScouted: all.filter((entry) => entry.scouted).length,
            previouslySent: all.filter((entry) => excludedIds.has(entry.externalId)).length,
            areaLinks: areaLinks.map((link) => link.text),
          },
        },
      });
      return { collected: result.candidates, listed: all.length };
    } finally {
      await disconnect(browser);
    }
  } finally {
    await releaseSession(bb, session.id);
  }
}

async function closeScoutModal(page: Page) {
  const cancel = page.locator("a.send-modal_cancel:visible").first();
  if (await cancel.count()) await cancel.click({ timeout: 3_000 }).catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.evaluate(() => {
    document.querySelectorAll("#admin-alert, .admin-alert_main, .iziModal-overlay").forEach((element) => {
      const root = element.closest("#admin-alert") || element;
      root.remove();
    });
  }).catch(() => undefined);
  await page.waitForTimeout(300);
}

type SendOutcome = { status: "sent" | "failed" | "uncertain"; error?: string; rejected?: boolean };

/** 1人分：小窓を開き、テンプレートを選んで本文が入ったのを確かめてから送信する */
async function sendOneScout(
  client: SupabaseClient,
  runToken: string,
  page: Page,
  candidate: { id: string; externalId: string },
  options: { templateName: string | null; message: string | null },
): Promise<SendOutcome> {
  const externalId = candidate.externalId;
  if (!/^\d+$/.test(externalId)) return { status: "failed", error: "候補のIDが正しくありません" };
  await closeScoutModal(page);

  // サイト自身の「履歴書&スカウト」と同じ仕組みで小窓を開く（一覧に載っていない人でも開ける）
  await page.evaluate((id) => {
    const opener = document.createElement("a");
    opener.className = "send-get_modal";
    opener.setAttribute("data-row", `resume,${id}`);
    opener.style.display = "none";
    document.body.appendChild(opener);
    opener.click();
    opener.remove();
  }, externalId);

  const form = page.locator(`form#form-scout:has(input[name="user_id"][value="${externalId}"])`).last();
  try {
    await form.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    const modalText = await page.locator(".admin-alert_main:visible").last().innerText().catch(() => "");
    return {
      status: "failed",
      error: modalText
        ? `スカウトの小窓が開けませんでした：${modalText.replace(/\s+/g, " ").slice(0, 200)}`
        : "スカウトの小窓が開けませんでした（すでにスカウト済み・退会の可能性）",
    };
  }
  const modal = form.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' admin-alert_main ')][1]");
  const scope = await modal.count() ? modal : form;
  const modalText = (await scope.innerText().catch(() => "")).normalize("NFKC");
  if (!modalText.includes(`No.${externalId}`)) {
    return { status: "failed", error: "小窓の履歴書番号が一致しないため送信していません" };
  }

  const template = form.locator("select#mail_template");
  const message = form.locator("textarea[name='message']");
  if (await template.count()) {
    const choices = await template.locator("option").evaluateAll((elements) => elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: (element.textContent || "").normalize("NFKC").trim(),
    })));
    const wanted = (options.templateName || "").normalize("NFKC").trim();
    const choice = wanted
      ? choices.find((option) => option.value && option.label === wanted)
        || choices.find((option) => option.value && option.label.includes(wanted))
      : choices.find((option) => option.value);
    if (wanted && !choice) {
      return { status: "failed", error: `スカウトテンプレート「${wanted}」が見つかりません` };
    }
    if (choice) await template.selectOption(choice.value);
  }
  let body = "";
  for (let attempt = 0; attempt < 16; attempt += 1) {
    body = (await message.inputValue().catch(() => "")).trim();
    if (body) break;
    await page.waitForTimeout(500);
  }
  if (!body && options.message?.trim()) {
    await message.fill(options.message.trim());
    body = options.message.trim();
  }
  if (!body) return { status: "failed", error: "スカウト本文が入りませんでした（スカウトテンプレートを確認してください）" };

  const submit = scope.locator("a.send-modal_post[data-post='scout']");
  if (await submit.count() !== 1) return { status: "failed", error: "「スカウトを送信」ボタンが見つかりません" };
  await submit.click({ trial: true, timeout: 10_000 });

  const marked = await rpcOrThrow<boolean>(client, "mark_estama_scout_sending", {
    p_run_token: runToken, p_candidate_id: candidate.id,
  });
  if (marked !== true) return { status: "failed", error: "送信直前の確認でこの人は送信対象から外れていました" };

  try {
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === "POST"
      && /\/admin_post\//.test(response.url())
      && !/\/admin_post\/modal\//.test(response.url())
    ), { timeout: 25_000 });
    await submit.click({ timeout: 10_000 });
    const response = await responsePromise;
    const data = await response.json().catch(() => null) as unknown;
    if (Array.isArray(data) && data[0] === "OK") return { status: "sent" };
    if (Array.isArray(data) && data[0] === "OUT") {
      const detail = JSON.stringify(data[1] ?? "").replace(/<[^>]+>/g, "").slice(0, 300);
      return { status: "failed", rejected: true, error: `エステ魂に受け付けられませんでした：${detail}` };
    }
    return { status: "uncertain", error: `送信後の返事を確認できませんでした（${response.status()}）` };
  } catch (error) {
    return { status: "uncertain", error: `送信後の結果を確認できませんでした：${error instanceof Error ? error.message : String(error)}`.slice(0, 500) };
  }
}

/** OKが出た人に送る */
async function sendApprovedScouts(client: SupabaseClient, runToken: string, batchId: string, connection: Connection) {
  const job = await rpcOrThrow<ScoutJob>(client, "get_estama_scout_job", {
    p_run_token: runToken, p_batch_id: batchId, p_mode: "send",
  });
  if (!job?.ok) return { skipped: true, reason: job?.reason };
  const candidates = job.candidates || [];
  const startedAt = Date.now();
  let sent = 0;
  let stopReason = "";
  let timedOut = false;

  let bb: Awaited<ReturnType<typeof createBrowserSession>>["bb"] | null = null;
  let sessionId = "";
  try {
    const created = await createBrowserSession(
      connection.browserbase_context_id,
      false,
      { action: "scout-send", storeId: connection.store_id },
      { solveCaptchas: false },
    );
    bb = created.bb;
    sessionId = created.session.id;
    const { browser, page } = await connectSession(created.session.connectUrl);
    try {
      page.setDefaultTimeout(15_000);
      await page.goto(ESJOB_URL, { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);

      let rejectedInRow = 0;
      for (const candidate of candidates) {
        if (Date.now() - startedAt > SEND_TIME_BUDGET_MS) {
          timedOut = true;
          break;
        }
        const outcome = await sendOneScout(client, runToken, page, candidate, {
          templateName: job.templateName ?? null,
          message: job.message ?? null,
        });
        await rpcOrThrow<boolean>(client, "save_estama_scout_result", {
          p_run_token: runToken,
          p_candidate_id: candidate.id,
          p_status: outcome.status,
          p_error: outcome.error ?? null,
        });
        await closeScoutModal(page);
        if (outcome.status === "sent") {
          sent += 1;
          rejectedInRow = 0;
          await page.waitForTimeout(1_500);
          continue;
        }
        if (outcome.status === "uncertain") {
          stopReason = `${candidate.displayName || "候補"}さんの送信結果を確認できなかったため、重複を防ぐため残りの送信を止めました`;
          break;
        }
        rejectedInRow = outcome.rejected ? rejectedInRow + 1 : 0;
        if (rejectedInRow >= 2) {
          stopReason = `エステ魂に続けて受け付けられなかったため止めました：${outcome.error || ""}`.slice(0, 500);
          break;
        }
      }
    } finally {
      await disconnect(browser);
    }
  } catch (error) {
    stopReason = error instanceof LoginRequiredError
      ? "エステ魂のログインが切れています。キャスト管理の「エスたま自動化」から再ログインしてください"
      : `送信が途中で止まりました：${error instanceof Error ? error.message : String(error)}`.slice(0, 500);
  } finally {
    if (bb && sessionId) await releaseSession(bb, sessionId);
  }

  await rpcOrThrow<boolean>(client, "finish_estama_scout_batch", {
    p_run_token: runToken,
    p_batch_id: batchId,
    p_status: stopReason ? "failed" : timedOut ? "continue" : "done",
    p_error: stopReason || null,
    p_payload: {},
  });
  return { sent, total: candidates.length, stopReason: stopReason || undefined, timedOut };
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
    const batchId = typeof body.batchId === "string" && /^[0-9a-f-]{36}$/i.test(body.batchId) ? body.batchId : "";
    if (mode === "collect" || mode === "send") {
      if (!batchId) {
        res.status(400).json({ error: "batchId が必要です" });
        return;
      }
      if (mode === "collect") {
        try {
          const result = await collectScoutCandidates(client, runToken, batchId, claimed.connection);
          res.status(200).json({ ok: true, storeId: claimed.storeId, result });
        } catch (error) {
          const message = error instanceof LoginRequiredError
            ? "エステ魂のログインが切れています。キャスト管理の「エスたま自動化」から再ログインしてください"
            : `候補を集められませんでした：${error instanceof Error ? error.message : String(error)}`;
          await client.rpc("finish_estama_scout_batch", {
            p_run_token: runToken, p_batch_id: batchId, p_status: "failed", p_error: message.slice(0, 1_000), p_payload: {},
          });
          throw error;
        }
        return;
      }
      const result = await sendApprovedScouts(client, runToken, batchId, claimed.connection);
      res.status(200).json({ ok: true, storeId: claimed.storeId, result });
      return;
    }
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
