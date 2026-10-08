import type { Locator, Page } from "playwright-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  connectSession,
  createBrowserSession,
  disconnect,
  ensureAdminLogin,
  EstamaSubmissionUncertainError,
  LoginRequiredError,
  releaseSession,
  type Connection,
} from "./estama-automation.js";
import { clickWithScopedConfirmation } from "./playwright-actions.js";
import {
  chooseEstamaNewsAdminLink,
  countEstamaNewsTitle,
  isConfirmedEstamaNewsPublication,
  type EstamaNewsAdminLink,
  type EstamaNewsPublicationEvidence,
} from "./estama-store-news-utils.js";

export {
  chooseEstamaNewsAdminLink,
  countEstamaNewsTitle,
  isConfirmedEstamaNewsPublication,
  normalizeEstamaNewsText,
} from "./estama-store-news-utils.js";

const ESTAMA_ADMIN_HOME = "https://estama.jp/admin/";
const ESTAMA_CAST_EDIT = "https://estama.jp/admin/cast_edit/";
const REVIEW_REQUIRED_PREFIX = "【要確認・再送停止】";

const TITLE_SELECTOR = [
  'input[name*="title" i]',
  'input[id*="title" i]',
  'input[name*="subject" i]',
  'input[id*="subject" i]',
  'input[name*="headline" i]',
].join(",");

const BODY_SELECTOR = [
  'textarea[name*="body" i]',
  'textarea[id*="body" i]',
  'textarea[name*="content" i]',
  'textarea[id*="content" i]',
  'textarea[name*="news" i]',
  'textarea[id*="news" i]',
  "textarea",
].join(",");

const linksOnPage = async (page: Page): Promise<EstamaNewsAdminLink[]> => page.locator("a[href]").evaluateAll((nodes) =>
  nodes.map((node) => ({
    text: (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    href: (node as HTMLAnchorElement).href,
  })),
);

async function discoverNewsAdminUrl(page: Page) {
  await page.goto(ESTAMA_CAST_EDIT, { waitUntil: "domcontentloaded" });
  await ensureAdminLogin(page, "#Name");
  let selected = chooseEstamaNewsAdminLink(await linksOnPage(page));
  if (selected) return selected.href;

  await page.goto(ESTAMA_ADMIN_HOME, { waitUntil: "domcontentloaded" });
  await ensureAdminLogin(page);
  selected = chooseEstamaNewsAdminLink(await linksOnPage(page));
  if (!selected) throw new Error("エステ魂管理画面の店舗ニュースメニューが見つかりません");
  return selected.href;
}

async function firstVisible(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function findNewsForm(page: Page) {
  const bodyField = await firstVisible(page.locator(BODY_SELECTOR));
  if (!bodyField) return null;
  const form = bodyField.locator("xpath=ancestor::form[1]");
  if (!await form.count()) return null;
  const titleField = await firstVisible(form.locator(TITLE_SELECTOR));
  return { form, titleField, bodyField };
}

async function openNewsPostForm(page: Page, newsUrl: string) {
  await page.goto(newsUrl, { waitUntil: "domcontentloaded" });
  await ensureAdminLogin(page);
  let fields = await findNewsForm(page);
  if (fields) return fields;

  const actions = page.locator('a, button, input[type="button"], input[type="submit"]');
  const textAction = await firstVisible(actions.filter({
    hasText: /ニュース.*(?:新規|登録|追加)|(?:新規|登録|追加).*ニュース|新規登録|新規作成|追加する/,
  }));
  const inputAction = await firstVisible(page.locator([
    'input[type="button"][value*="新規"]',
    'input[type="submit"][value*="新規"]',
    'input[type="button"][value*="追加"]',
    'input[type="submit"][value*="追加"]',
  ].join(",")));
  const action = textAction || inputAction;
  if (!action) throw new Error("エステ魂のニュース新規登録ボタンが見つかりません");

  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => undefined),
    action.click(),
  ]);
  fields = await findNewsForm(page);
  if (!fields) throw new Error("エステ魂のニュース投稿フォームが見つかりません");
  return fields;
}

async function fitInput(locator: Locator, value: string, fallbackMax: number) {
  const rawMax = Number(await locator.getAttribute("maxlength").catch(() => null));
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : fallbackMax;
  const normalized = value.trim().slice(0, max);
  await locator.fill(normalized);
  return normalized;
}

async function downloadNewsImage(rawUrl: string, index: number) {
  const url = new URL(rawUrl);
  const allowed = url.protocol === "https:" && (
    url.hostname.endsWith(".supabase.co")
    || url.hostname === "drive.google.com"
    || url.hostname === "storage.googleapis.com"
  );
  if (!allowed) return null;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`エステ魂用画像${index + 1}を取得できません（HTTP ${response.status}）`);
  const mimeType = response.headers.get("content-type") || "";
  if (!/^image\/(?:jpeg|png|webp)$/i.test(mimeType)) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error(`エステ魂用画像${index + 1}が10MBを超えています`);
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  return { name: `news-${index + 1}.${extension}`, mimeType, buffer };
}

async function attachNewsImages(form: Locator, imageUrls: string[]) {
  const fileInputs = form.locator('input[type="file"]');
  const inputCount = await fileInputs.count();
  if (!inputCount || !imageUrls.length) return 0;

  const files = (await Promise.all(imageUrls.slice(0, Math.max(1, inputCount)).map(downloadNewsImage)))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  if (!files.length) return 0;

  const first = fileInputs.first();
  if (await first.getAttribute("multiple") !== null) {
    await first.setInputFiles(files);
    return files.length;
  }
  const count = Math.min(files.length, inputCount);
  for (let index = 0; index < count; index += 1) await fileInputs.nth(index).setInputFiles(files[index]);
  return count;
}

async function publicTitleCount(url: string, title: string) {
  try {
    const response = await fetch(url, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return 0;
    return countEstamaNewsTitle(await response.text(), title);
  } catch {
    return 0;
  }
}

async function visibleSuccess(page: Page) {
  const candidates = page.locator('.alert-success:visible, .success:visible, .notice:visible, [role="status"]:visible');
  const texts = await candidates.allTextContents().catch(() => [] as string[]);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return [...texts, bodyText].some((text) => /(?:登録|投稿|保存).*(?:完了|しました|成功)|(?:完了|成功).*(?:登録|投稿|保存)/.test(text));
}

async function confirmationVisible(page: Page) {
  const modal = page.locator('[role="dialog"]:visible, dialog[open], [aria-modal="true"]:visible, .modal:visible');
  if (await modal.count() && await modal.first().isVisible().catch(() => false)) return true;
  return /\/(?:confirm|confirmation|preview|check)(?:\/|$)/i.test(new URL(page.url()).pathname);
}

export type EstamaStoreNewsArticle = {
  id: string;
  store_id: string;
  title: string;
  content: string | null;
  image_urls: string[] | null;
};

export async function postEstamaStoreNews(
  _admin: SupabaseClient,
  connection: Connection,
  article: EstamaStoreNewsArticle,
) {
  if (!connection.browserbase_context_id || connection.status !== "ready") {
    throw new LoginRequiredError("エステ魂の再ログインが必要です");
  }
  if (!connection.shop_id) throw new Error("エステ魂の店舗IDが未設定です");
  const body = article.content?.trim() || "";
  if (!article.title.trim() || !body) throw new Error("ニュースのタイトルと本文が必要です");

  const publicUrl = `https://estama.jp/shop/${encodeURIComponent(connection.shop_id)}/newslist/`;
  const created = await createBrowserSession(
    connection.browserbase_context_id,
    false,
    { action: "store-news", storeId: article.store_id, articleId: article.id },
    { solveCaptchas: false },
  );
  let browser: Awaited<ReturnType<typeof connectSession>>["browser"] | null = null;
  try {
    const connected = await connectSession(created.session.connectUrl);
    browser = connected.browser;
    const page = connected.page;
    const newsAdminUrl = await discoverNewsAdminUrl(page);
    const { form, titleField, bodyField } = await openNewsPostForm(page, newsAdminUrl);
    const submittedTitle = titleField
      ? await fitInput(titleField, article.title, 80)
      : article.title.trim();
    const submittedBody = await fitInput(bodyField, body, 5_000);
    const uploadedImages = await attachNewsImages(form, article.image_urls || []);
    const publicCountBefore = await publicTitleCount(publicUrl, submittedTitle);

    const textSubmit = await firstVisible(form.locator('button, a').filter({
      hasText: /登録する|投稿する|保存する|公開する|登録|投稿|保存|公開/,
    }));
    const inputSubmit = await firstVisible(form.locator([
      'input[type="submit"][value*="登録"]',
      'input[type="submit"][value*="投稿"]',
      'input[type="submit"][value*="保存"]',
      'input[type="submit"][value*="公開"]',
    ].join(",")));
    const submit = textSubmit || inputSubmit;
    if (!submit) throw new Error("エステ魂のニュース投稿ボタンが見つかりません");
    await clickWithScopedConfirmation(page, submit);

    let publicCountAfter = await publicTitleCount(publicUrl, submittedTitle);
    for (let attempt = 0; attempt < 3 && publicCountAfter <= publicCountBefore; attempt += 1) {
      await page.waitForTimeout(700 + attempt * 800);
      publicCountAfter = await publicTitleCount(publicUrl, submittedTitle);
    }
    const currentBodyField = await firstVisible(page.locator(BODY_SELECTOR));
    const evidence: EstamaNewsPublicationEvidence = {
      publicCountBefore,
      publicCountAfter,
      successVisible: await visibleSuccess(page),
      formVisible: Boolean(currentBodyField),
      currentBody: currentBodyField ? await currentBodyField.inputValue().catch(() => null) : null,
      submittedBody,
      confirmationVisible: await confirmationVisible(page),
    };
    if (!isConfirmedEstamaNewsPublication(evidence)) {
      throw new EstamaSubmissionUncertainError("エステ魂のニュース送信後、掲載結果を確認できません");
    }
    return { posted: true, url: publicUrl, uploadedImages, title: submittedTitle };
  } catch (error) {
    if (error instanceof EstamaSubmissionUncertainError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(REVIEW_REQUIRED_PREFIX)) throw new EstamaSubmissionUncertainError(message);
    throw error;
  } finally {
    if (browser) await disconnect(browser);
    await releaseSession(created.bb, created.session.id);
  }
}

