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
  countEstamaNewsTitle,
  ESTAMA_NEWS_BODY_MAX,
  ESTAMA_NEWS_TITLE_MAX,
  fitEstamaNewsText,
  isConfirmedEstamaNewsPublication,
  parseEstamaNewsRemaining,
  type EstamaNewsPublicationEvidence,
} from "./estama-store-news-utils.js";

export {
  chooseEstamaNewsAdminLink,
  countEstamaNewsTitle,
  isConfirmedEstamaNewsPublication,
  normalizeEstamaNewsText,
} from "./estama-store-news-utils.js";

const ESTAMA_NEWS_LIST = "https://estama.jp/admin/news/";
const ESTAMA_NEWS_EDIT = "https://estama.jp/admin/news_edit/";
const REVIEW_REQUIRED_PREFIX = "【要確認・再送停止】";
// 「設置するボタン」は公式HP（main[news_type] = 3）。HPのニュースなので、エステ魂の記事からHPへ案内する
const NEWS_BUTTON_OFFICIAL_HP = "3";

async function firstVisible(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function downloadNewsImage(rawUrl: string) {
  const url = new URL(rawUrl);
  const allowed = url.protocol === "https:" && (
    url.hostname.endsWith(".supabase.co")
    || url.hostname === "drive.google.com"
    || url.hostname === "storage.googleapis.com"
  );
  if (!allowed) return null;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return null;
  const mimeType = response.headers.get("content-type") || "";
  if (!/^image\/(?:jpeg|png)$/i.test(mimeType)) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength || buffer.byteLength > 16 * 1024 * 1024) return null;
  return { name: `news.${mimeType.includes("png") ? "png" : "jpg"}`, mimeType, buffer };
}

/**
 * 画像は1枚目の枠（#news_icon_1）へ。押すとファイル選択 → 切り抜きの小窓（croppic）が開くので「切り抜き」を押す。
 * 付けられなくても本文だけで投稿する（画像は任意の項目）。
 */
async function attachNewsImage(page: Page, imageUrls: string[]) {
  const file = await (async () => {
    for (const url of imageUrls.slice(0, 3)) {
      const downloaded = await downloadNewsImage(url).catch(() => null);
      if (downloaded) return downloaded;
    }
    return null;
  })();
  if (!file) return 0;
  const slot = page.locator("#news_icon_1");
  if (!await slot.count()) return 0;
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10_000 }),
      slot.click(),
    ]);
    await chooser.setFiles(file);
    const crop = page.locator(".cropControlCrop:visible").first();
    await crop.waitFor({ state: "visible", timeout: 20_000 });
    await crop.click();
    await page.locator(".img_upped #news_icon_1, .img_upped:has(#news_icon_1)").first()
      .waitFor({ state: "attached", timeout: 20_000 });
    return 1;
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", msg: "estama_news_image_skipped", error: error instanceof Error ? error.message : String(error) }));
    // 開いたままの切り抜きの小窓は閉じる（投稿ボタンの邪魔をしないように）
    await page.locator(".cropControlReset:visible, .cropControlRemoveCroppedImage:visible").first().click().catch(() => undefined);
    return 0;
  }
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
    page.setDefaultTimeout(15_000);

    // 1日10回まで（朝6時にリセット）。エステ魂の「AI広報部」がオンだと自動の投稿で使い切ることがある
    await page.goto(ESTAMA_NEWS_LIST, { waitUntil: "domcontentloaded" });
    await ensureAdminLogin(page);
    const remaining = parseEstamaNewsRemaining(await page.locator("body").innerText().catch(() => ""));
    if (remaining === 0) {
      throw new Error("エステ魂の今日のニュース投稿回数（1日10回）を使い切っています（エステ魂の「AI広報部」の自動投稿も回数に入ります）。朝6時を過ぎてから送り直してください。投稿は行っていません");
    }

    await page.goto(ESTAMA_NEWS_EDIT, { waitUntil: "domcontentloaded" });
    await ensureAdminLogin(page);
    const titleField = page.locator("#PostTitle");
    const bodyField = page.locator("#PostContent");
    if (!await titleField.count() || !await bodyField.count()) {
      throw new Error("エステ魂のニュース投稿フォームが見つかりません（画面仕様変更の可能性）。投稿は行っていません");
    }
    const submittedTitle = fitEstamaNewsText(article.title, ESTAMA_NEWS_TITLE_MAX);
    const submittedBody = fitEstamaNewsText(body, ESTAMA_NEWS_BODY_MAX);
    await titleField.fill(submittedTitle);
    await bodyField.fill(submittedBody);
    await page.locator(`input[name="main[news_type]"][value="${NEWS_BUTTON_OFFICIAL_HP}"]`).check({ force: true }).catch(() => undefined);
    await page.locator("#FuturePostOff").check({ force: true }).catch(() => undefined);
    const uploadedImages = await attachNewsImage(page, article.image_urls || []);
    const publicCountBefore = await publicTitleCount(publicUrl, submittedTitle);

    // 送信ボタンは .l-edit_submit の中（「キャンセルして戻る」以外）。回数が残っていないと出ない
    const submitArea = page.locator("#form-news_edit .l-edit_submit, .l-edit_submit");
    const submit = await firstVisible(submitArea.locator("a, button, input[type=submit], input[type=button]").filter({
      hasNotText: /キャンセル|戻る/,
    }));
    if (!submit) {
      throw new Error("エステ魂のニュース投稿ボタンが見つかりません（今日の投稿回数が残っていない可能性）。投稿は行っていません");
    }
    await clickWithScopedConfirmation(page, submit);

    let publicCountAfter = await publicTitleCount(publicUrl, submittedTitle);
    for (let attempt = 0; attempt < 3 && publicCountAfter <= publicCountBefore; attempt += 1) {
      await page.waitForTimeout(700 + attempt * 800);
      publicCountAfter = await publicTitleCount(publicUrl, submittedTitle);
    }
    const currentBodyField = await firstVisible(page.locator("#PostContent"));
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

