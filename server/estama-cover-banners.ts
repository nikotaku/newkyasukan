// エステ魂のカバー画像（店舗プロフィール「集客用 カバー画像」の3枠。店舗ページ上部のスライド）を、
// HPのトップバナーと同じセラピストのバナーで入れ替える。
//   pg_cron（private.dispatch_estama_cover_banners）→ /api/cron/estama-appeal?action=estama-scout（mode: cover-banners）
//   1. その営業日の出勤から、HPと同じ決め方（castHeroBannersForDay）でバナーを並べ、設定の枠の数だけ先頭から使う
//   2. HPの /banner-render（1000×500）をブラウザで開いて撮る（HPと同じデザイン・同じ写真）
//   3. エステ魂の /admin/shop/profile/edit/ で、その枠に画像を入れて「保存する」（「保存と同時に上位表示する」は外す）
//   4. 店舗ページで画像が替わったことを確かめて、RPC finish_estama_cover_rotation に記録（露出ノルマも）
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "playwright-core";
import { castHeroBannersForDay, type BannerShiftRow } from "../src/lib/castHeroBanners.js";
import { assignCoverSlots, bannerRenderUrl, type CoverAssignment } from "./estama-cover-slots.js";
import {
  connectSession,
  createBrowserSession,
  disconnect,
  ensureAdminLogin,
  LoginRequiredError,
  releaseSession,
  type Connection,
} from "./estama-automation.js";

const EDIT_URL = "https://estama.jp/admin/shop/profile/edit/";
const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://newkyasukan.vercel.app").replace(/\/$/, "");
export const ESTAMA_COVER_WIDTH = 1000;
export const ESTAMA_COVER_HEIGHT = 500;

type StartedRotation = { storeId: string; date: string; slots: number[]; enabled: boolean };

function renderDomains() {
  const hosts = new Set(["estama.jp", new URL(SITE_URL).hostname, "fonts.googleapis.com", "fonts.gstatic.com"]);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (supabaseUrl) hosts.add(new URL(supabaseUrl).hostname);
  else hosts.add("imrxzkivwrkqbhqfbbes.supabase.co");
  return [...hosts];
}

async function loadDayBanners(client: SupabaseClient, storeId: string, date: string) {
  const { data, error } = await client
    .from("shifts")
    .select("cast_id, start_time, end_time, casts (id, name, age, is_active, is_visible, join_date, banner_images, banner_copy, banner_enabled)")
    .eq("shift_date", date)
    .eq("store_id", storeId)
    .order("start_time");
  if (error) throw new Error(`出勤を読めませんでした：${error.message}`);
  return castHeroBannersForDay((data ?? []) as unknown as BannerShiftRow[], date, Number.MAX_SAFE_INTEGER);
}

/** /banner-render を開いて 1000×500 のPNGを撮る */
async function renderBanner(page: Page, url: string) {
  await page.setViewportSize({ width: ESTAMA_COVER_WIDTH, height: ESTAMA_COVER_HEIGHT });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const root = page.locator("[data-banner-root][data-banner-ready]");
  await root.waitFor({ state: "attached", timeout: 30_000 });
  const ready = await root.getAttribute("data-banner-ready");
  if (ready !== "1") throw new Error("バナーを作れませんでした（素材の写真が読めない・その日の出勤がない）");
  await page.waitForTimeout(300);
  return root.screenshot({ type: "png", animations: "disabled" });
}

/**
 * 編集画面のカバー画像の枠ごとの今の画像（URL）。空なら ""。
 * 枠は .upload_area（中に input#cover_N と、画像の入る .upload_area__results）
 */
async function readCoverSlots(page: Page) {
  return page.evaluate(() => [1, 2, 3].map((slot) => {
    const area = document.getElementById(`cover_${slot}`)?.closest(".upload_area");
    const image = area?.querySelector<HTMLImageElement>(".upload_area__results img");
    return image?.getAttribute("src") || "";
  }));
}

/**
 * 1枠に画像を入れる。input#cover_N（class admin_upload_cover_image）にファイルを入れると、
 * エステ魂の画面が幅1000pxに縮めて /file_upload/cover_image_tmp/cover_N/ へ送り、枠の画像を差し替える
 * （保存するまでは仮の画像）。失敗したときは alert が出る。
 */
async function uploadCover(page: Page, slot: number, png: Buffer, alerts: string[]) {
  const before = (await readCoverSlots(page))[slot - 1];
  const alertCount = alerts.length;
  await page.locator(`#cover_${slot}`).setInputFiles({ name: `cover_${slot}.png`, mimeType: "image/png", buffer: png });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_000);
    if (alerts.length > alertCount) throw new Error(`カバー画像${slot}枠目をアップロードできませんでした：${alerts[alerts.length - 1]}`);
    const errorVisible = await page.locator("#Modal_FILE_UPLOAD_ERROR").isVisible().catch(() => false);
    if (errorVisible) throw new Error(`カバー画像${slot}枠目をアップロードできませんでした（エステ魂の画面のエラー）`);
    const now = (await readCoverSlots(page))[slot - 1];
    if (now && now !== before) return now;
  }
  throw new Error(`カバー画像${slot}枠目のアップロードが終わりませんでした`);
}

async function saveProfile(page: Page) {
  // 「保存と同時に上位表示する」は回数に限りがあるので使わない
  const boost = page.locator("#set_up_limit");
  if (await boost.count() && await boost.isChecked().catch(() => false)) {
    await boost.uncheck({ force: true }).catch(async () => {
      await boost.evaluate((element) => { (element as HTMLInputElement).checked = false; });
    });
  }
  // 「保存する」は a.btn-default_submit（押すとフォームを submit する）
  const save = page.locator("form[method=POST] .btn-default_submit, form[method=POST] button, form[method=POST] input[type=submit]")
    .filter({ hasText: /保存する/ }).first();
  if (!(await save.count())) throw new Error("「保存する」ボタンが見つかりません（エステ魂の画面が変わった可能性）");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined),
    save.click(),
  ]);
  await page.waitForTimeout(1_500);
  const validation = await page.locator(".vali_error, .validation-error.active-error, .alert-danger").allInnerTexts().catch(() => []);
  const message = validation.map((text) => text.trim()).filter(Boolean).join(" / ");
  if (message) throw new Error(`エステ魂で保存できませんでした：${message.slice(0, 200)}`);
}

/** 公開の店舗ページのカバー画像（スライド）のURL */
async function readPublicCovers(page: Page, shopId: string) {
  await page.goto(`https://estama.jp/shop/${shopId}/?t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>(".shop-cover img"))
    .map((image) => image.getAttribute("src") || "")
    .filter((src) => src.includes("/shop/vip/"))
    .filter((src, index, list) => list.indexOf(src) === index));
}

export async function rotateEstamaCoverBanners(client: SupabaseClient, runToken: string, connection: Connection) {
  if (!connection.browserbase_context_id) throw new LoginRequiredError("Browserbaseの保存済みログイン情報がありません");
  const { data: startData, error: startError } = await client.rpc("start_estama_cover_rotation", { p_run_token: runToken });
  if (startError) throw new Error(`開始できませんでした：${startError.message}`);
  const started = startData as StartedRotation;
  const finish = async (status: "done" | "failed" | "skipped", assignments: CoverAssignment[], imageUrls: string[], error?: string) => {
    const { error: finishError } = await client.rpc("finish_estama_cover_rotation", {
      p_run_token: runToken,
      p_status: status,
      p_slots: assignments.map((item) => item.slot),
      p_cast_ids: assignments.map((item) => item.banner.castId),
      p_cast_names: assignments.map((item) => item.banner.name),
      p_image_urls: imageUrls,
      p_error: error ?? null,
    });
    if (finishError) console.error(JSON.stringify({ level: "error", msg: "estama_cover_finish_failed", error: finishError.message }));
  };

  if (!started.enabled) {
    await finish("skipped", [], [], "設定がオフです");
    return { status: "skipped", reason: "disabled" };
  }
  const banners = await loadDayBanners(client, started.storeId, started.date);
  const assignments = assignCoverSlots(started.slots, banners);
  if (!assignments.length) {
    await finish("skipped", [], [], "今日の出勤にバナーの素材があるセラピストがいません（カバー画像はそのまま）");
    return { status: "skipped", reason: "no-banners" };
  }

  const { bb, session } = await createBrowserSession(
    connection.browserbase_context_id,
    false,
    { action: "cover-banners", storeId: connection.store_id },
    // HPの /banner-render（とその写真・データ・フォント）も開くので、エステ魂のほかに許す
    { solveCaptchas: false, allowedDomains: renderDomains() },
  );
  try {
    const { browser, page } = await connectSession(session.connectUrl);
    try {
      page.setDefaultTimeout(20_000);
      // 1. 画像を作る（別のタブでHPの /banner-render を撮る）
      const renderPage = await page.context().newPage();
      const images: Array<{ slot: number; png: Buffer }> = [];
      try {
        for (const item of assignments) {
          images.push({ slot: item.slot, png: await renderBanner(renderPage, bannerRenderUrl(SITE_URL, started.storeId, started.date, item.banner.castId)) });
        }
      } finally {
        await renderPage.close().catch(() => undefined);
      }

      // 2. エステ魂の店舗プロフィールの編集画面で、枠に入れて保存
      const alerts: string[] = [];
      page.on("dialog", (dialog) => {
        alerts.push(dialog.message().slice(0, 200));
        void dialog.dismiss().catch(() => undefined);
      });
      await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);
      await page.locator("#cover_1").waitFor({ state: "attached" });
      const beforeSlots = await readCoverSlots(page);
      for (const image of images) await uploadCover(page, image.slot, image.png, alerts);
      await saveProfile(page);

      // 3. 保存できたかを編集画面を開き直して確かめる（入れた枠が新しい画像になり、ほかの枠はそのまま）
      await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
      const savedSlots = await readCoverSlots(page);
      const imageUrls = assignments.map((item) => savedSlots[item.slot - 1] || "");
      const unchanged = assignments.filter((item, index) => !imageUrls[index] || imageUrls[index] === beforeSlots[item.slot - 1]);
      if (unchanged.length) {
        throw new Error(`保存後もカバー画像が替わっていません（${unchanged.map((item) => `${item.slot}枠目`).join("・")}）`);
      }
      const publicCovers = connection.shop_id ? await readPublicCovers(page, String(connection.shop_id)).catch(() => []) : [];
      await finish("done", assignments, imageUrls);
      return { status: "done", slots: assignments.map((item) => item.slot), casts: assignments.map((item) => item.banner.name), publicCovers: publicCovers.length };
    } finally {
      await disconnect(browser);
    }
  } catch (error) {
    const message = error instanceof LoginRequiredError
      ? "エステ魂のログインが切れています（自動で再ログインします）"
      : error instanceof Error ? error.message : String(error);
    await finish("failed", assignments, [], message);
    throw error;
  } finally {
    await releaseSession(bb, session.id);
  }
}
