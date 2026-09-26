// お客様からのSMS返信をLINEに知らせるための文面と、送ってよいかの判定。
// 予約通知専用アカウントは月の無料枠が小さく、WEB予約通知を漏らさないことを最優先にするため、
// 残り通数がWEB予約通知の予備分を下回ったらSMS返信の通知は送らない。

export interface SmsReplyReservation {
  date: string | null;
  time: string | null;
  castName: string | null;
}

export interface SmsReplyMessageInput {
  storeName: string | null;
  customerName: string | null;
  phone: string;
  body: string;
  reservation?: SmsReplyReservation | null;
  threadUrl?: string | null;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_BODY_LENGTH = 500;

export function toLocalPhone(e164: string) {
  const digits = e164.replace(/[^\d+]/g, "");
  return digits.startsWith("+81") ? `0${digits.slice(3)}` : digits;
}

export function smsThreadUrl(customDomain: string | null | undefined, fromNumber: string) {
  const domain = (customDomain || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!domain || !fromNumber) return null;
  return `https://${domain}/sms?to=${encodeURIComponent(fromNumber)}`;
}

function reservationLine(reservation: SmsReplyReservation) {
  const parts: string[] = [];
  if (reservation.date && /^\d{4}-\d{2}-\d{2}$/.test(reservation.date)) {
    const [year, month, day] = reservation.date.split("-").map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    parts.push(`${month}/${day}(${weekday})`);
  }
  if (reservation.time) parts.push(`${reservation.time.slice(0, 5)}〜`);
  if (reservation.castName) parts.push(reservation.castName);
  return parts.length ? `予約: ${parts.join(" ")}` : null;
}

export function buildSmsReplyLineMessage(input: SmsReplyMessageInput) {
  const body = input.body.trim();
  const clipped = body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH)}…` : body;
  const name = input.customerName?.trim();
  const lines = [
    `💬 SMS返信${input.storeName ? `（${input.storeName}）` : ""}`,
    `${name ? `${name} 様` : "お客様"}（${toLocalPhone(input.phone)}）`,
    "",
    clipped || "（本文なし）",
  ];
  const reservation = input.reservation ? reservationLine(input.reservation) : null;
  if (reservation) lines.push("", reservation);
  if (input.threadUrl) lines.push("", `▶ 返信する: ${input.threadUrl}`);
  return lines.join("\n");
}

export interface QuotaSnapshot {
  // null = 上限なし（有料プランの従量課金など）
  limit: number | null;
  used: number;
  // グループへの送信は参加人数分カウントされる
  members: number;
}

// WEB予約通知のために残しておく通知回数
export const WEB_BOOKING_RESERVED_NOTIFICATIONS = 15;

export function canSendSmsReplyNotice(
  quota: QuotaSnapshot | null,
  reservedNotifications = WEB_BOOKING_RESERVED_NOTIFICATIONS,
) {
  // 残数を確認できないときは送る（通知漏れのほうが困るため）
  if (!quota || quota.limit === null) return true;
  const members = Math.max(1, quota.members);
  const remaining = quota.limit - quota.used;
  return remaining - members >= reservedNotifications * members;
}
