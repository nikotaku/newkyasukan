// エステ魂の仮予約（管理画面「お店への予約」/admin/reserve/）を読んで、HPのシステム（estama_reservation_requests）に入れる。
// 読むだけで、エステ魂の画面のボタンは押さない。pg_cron（private.dispatch_estama_reserve_sync）→ /api/cron/estama-appeal?action=estama-scout（mode: reserve-sync）
// 保存と判定（ダミー・HPの出勤・予約の重なり）は RPC save_estama_reservation_requests（実行トークン付き）。
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  connectSession,
  createBrowserSession,
  disconnect,
  ensureAdminLogin,
  LoginRequiredError,
  releaseSession,
  type Connection,
} from "./estama-automation.js";
import { parseEstamaContractUntil, parseEstamaReservations, type EstamaReservation } from "./estama-reserve-parse.js";

const RESERVE_URL = "https://estama.jp/admin/reserve/";

export async function syncEstamaReservations(client: SupabaseClient, runToken: string, connection: Connection) {
  if (!connection.browserbase_context_id) throw new LoginRequiredError("Browserbaseの保存済みログイン情報がありません");
  const { bb, session } = await createBrowserSession(
    connection.browserbase_context_id,
    false,
    { action: "reserve-sync", storeId: connection.store_id },
    { solveCaptchas: false },
  );
  let items: EstamaReservation[] = [];
  let contractUntil: string | null = null;
  try {
    const { browser, page } = await connectSession(session.connectUrl);
    try {
      page.setDefaultTimeout(15_000);
      // 受付日時が新しい順の1ページ目（20件）。5分ごとに読むので、新しい仮予約はここに必ず入る
      await page.goto(RESERVE_URL, { waitUntil: "domcontentloaded" });
      await ensureAdminLogin(page);
      const text = await page.locator("main, #main, .l-main, body").first().innerText();
      items = parseEstamaReservations(text).filter((item) => item.customerPhone || item.customerEmail);
      // 画面の上の「ご契約期間：…まで」（サブスクの見張りで、掲載プランが切れていないか見る）
      contractUntil = parseEstamaContractUntil(await page.locator("body").innerText().catch(() => ""));
    } finally {
      await disconnect(browser);
    }
  } finally {
    await releaseSession(bb, session.id);
  }
  if (contractUntil) {
    await client.rpc("save_estama_contract_info", { p_run_token: runToken, p_until: contractUntil })
      .then(({ error }) => { if (error) console.error("save_estama_contract_info failed", error.message); });
  }
  const { data, error } = await client.rpc("save_estama_reservation_requests", { p_run_token: runToken, p_items: items });
  if (error) throw new Error(`仮予約を保存できませんでした：${error.message}`);
  return { found: items.length, saved: data };
}
