/** Google Apps Script Webhook へ予約/顧客データを送信するユーティリティ */

const LS_KEY = "sheet_webhook_url_v1";

export function getWebhookUrl(): string {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return "";
  }
}

export function saveWebhookUrl(url: string) {
  try {
    localStorage.setItem(LS_KEY, url.trim());
  } catch {}
}

export type SheetRecordType = "reservation" | "customer";

/**
 * GAS Webhook へ追記リクエストを送る。
 * GAS の Web アプリは CORS ヘッダを返さないため no-cors で送信する（レスポンスは読めない＝fire-and-forget）。
 * Content-Type を text/plain にしてプリフライトを回避する。
 */
export async function postToSheet(type: SheetRecordType, payload: Record<string, unknown>) {
  const url = getWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type, payload }),
    });
  } catch (e) {
    console.error("sheet webhook failed:", e);
  }
}
