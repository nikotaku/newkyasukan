// Twilio（SMS）の残高・今月の使用額のまとめと、残高が少ないときの通知判定。
// Twilioは送信したSMSの料金確定が遅れることがあり、確定前の分はまだ残高から引かれていない。
// その分を「未確定の送信分」として概算し、実質の残りを出す。

export const BALANCE_ALERT_THRESHOLD = 1000;
// 料金表を取れなかったときの日本宛てSMSの1通分（円）
export const FALLBACK_JP_SMS_UNIT_PRICE = 14.36;
const ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface TwilioUsageRecord {
  category: string;
  price: string | number | null;
}

export interface TwilioMessage {
  direction: string;
  status: string;
  price: string | null;
  num_segments: string | number | null;
  date_created: string;
}

export interface BillingSummary {
  currency: string;
  balance: number;
  pendingSegments: number;
  pendingEstimate: number;
  effectiveBalance: number;
  monthUsage: number;
  monthOutboundMessages: number;
  monthOutboundSegments: number;
  unitPrice: number;
  threshold: number;
  low: boolean;
  checkedAt: string;
}

// 日本時間の今月1日0時（ISO）
export function jstMonthStart(now: Date) {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - JST_OFFSET_MS);
}

const amount = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

// Twilioの今月の使用額。totalprice があればそれ、無ければ主要カテゴリを足す（子カテゴリの二重計上はしない）
export function monthUsageFromRecords(records: TwilioUsageRecord[]) {
  const price = (category: string) => amount(records.find((r) => r.category === category)?.price);
  if (price("totalprice") > 0) return price("totalprice");
  const parents = ["sms", "mms", "calls", "recordings", "transcriptions", "lookups"];
  let total = parents.reduce((sum, category) => sum + price(category), 0);
  total += records.some((r) => r.category === "phonenumbers")
    ? price("phonenumbers")
    : records.filter((r) => r.category.startsWith("phonenumbers-")).reduce((sum, r) => sum + amount(r.price), 0);
  return total;
}

export function summarizeTwilioBilling(input: {
  balance: number;
  currency: string;
  usageRecords: TwilioUsageRecord[];
  messages: TwilioMessage[];
  unitPrice: number | null;
  now: Date;
  threshold?: number;
}): BillingSummary {
  const monthStart = jstMonthStart(input.now).getTime();
  const unitPrice = input.unitPrice && input.unitPrice > 0 ? input.unitPrice : FALLBACK_JP_SMS_UNIT_PRICE;
  const outbound = input.messages.filter((m) =>
    m.direction.startsWith("outbound") && new Date(m.date_created).getTime() >= monthStart
  );
  const segments = (m: TwilioMessage) => Math.max(1, Number(m.num_segments) || 1);
  // 送れなかったもの（failed / canceled）は課金されない
  const pending = outbound.filter((m) => !m.price && !["failed", "canceled"].includes(m.status));
  const pendingSegments = pending.reduce((sum, m) => sum + segments(m), 0);
  const pendingEstimate = pendingSegments * unitPrice;
  const effectiveBalance = input.balance - pendingEstimate;
  const threshold = input.threshold ?? BALANCE_ALERT_THRESHOLD;
  return {
    currency: input.currency,
    balance: input.balance,
    pendingSegments,
    pendingEstimate,
    effectiveBalance,
    monthUsage: monthUsageFromRecords(input.usageRecords) + pendingEstimate,
    monthOutboundMessages: outbound.length,
    monthOutboundSegments: outbound.reduce((sum, m) => sum + segments(m), 0),
    unitPrice,
    threshold,
    low: effectiveBalance < threshold,
    checkedAt: input.now.toISOString(),
  };
}

// 残高が閾値を切っている間、1日1回まで知らせる。前回送れなかったときは次の確認で送り直す
export function shouldSendBalanceAlert(
  summary: Pick<BillingSummary, "low">,
  lastAlert: { created_at: string; delivered: boolean } | null,
  now: Date,
) {
  if (!summary.low) return false;
  if (!lastAlert || !lastAlert.delivered) return true;
  return now.getTime() - new Date(lastAlert.created_at).getTime() >= ALERT_INTERVAL_MS;
}

const yen = (value: number) => `${Math.round(value).toLocaleString("ja-JP")}円`;

export const TWILIO_BILLING_URL = "https://console.twilio.com/us1/billing/manage-billing/billing-overview";

export function buildBalanceAlertMessage(summary: BillingSummary) {
  return [
    "⚠️ SMS（Twilio）の残高が少なくなっています",
    `残り 約${yen(summary.effectiveBalance)}（送信済みで未精算の分を引いた額）`,
    `今月の使用額 約${yen(summary.monthUsage)}（送信${summary.monthOutboundMessages}通・${summary.monthOutboundSegments}通分）`,
    "",
    "残高が0円になるとSMSが送れなくなります。Twilioでチャージするか、オートチャージを設定してください。",
    TWILIO_BILLING_URL,
  ].join("\n");
}
