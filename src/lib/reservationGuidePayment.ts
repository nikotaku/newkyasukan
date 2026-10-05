// 予約案内ページ（/g/:token）の「お支払いのご案内」。RPC get_reservation_guide の payments を画面用にそろえる。

export interface GuidePayment {
  method: "card" | "paypay";
  /** 手数料込みのお支払い金額 */
  amount: number;
  fee: number;
  link: string | null;
  steps: string[];
}

export const GUIDE_PAYMENT_LABELS: Record<GuidePayment["method"], { name: string; button: string }> = {
  card: { name: "クレジットカード", button: "カード決済ページを開く" },
  paypay: { name: "PayPay", button: "PayPayでのお支払い方法を見る" },
};

/** 手順は1行に1つ。先頭の番号（1. ① など）は画面で振り直すので外す */
export function parseGuideSteps(text: string | null | undefined) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:\d+[.．)）、]|[①-⑳]|[-・])\s*/, "").trim())
    .filter(Boolean);
}

/** お客様に開いてもらってよいリンクだけ（https / http） */
export function safePaymentLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeGuidePayments(value: unknown): GuidePayment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const method = raw.method === "card" || raw.method === "paypay" ? raw.method : null;
    const amount = Number(raw.amount);
    if (!method || !Number.isFinite(amount) || amount <= 0) return [];
    return [{
      method,
      amount: Math.round(amount),
      fee: Math.max(0, Math.round(Number(raw.fee) || 0)),
      link: safePaymentLink(raw.link),
      steps: parseGuideSteps(typeof raw.guide === "string" ? raw.guide : null),
    }];
  });
}
