export interface SmsLog {
  id: string;
  store_id: string | null;
  reservation_id: string | null;
  customer_id: string | null;
  direction: "outbound" | "inbound" | string;
  to_number: string;
  from_number: string | null;
  body: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  is_read: boolean;
  created_at: string;
}

export const SMS_LOG_COLUMNS =
  "id, store_id, reservation_id, customer_id, direction, to_number, from_number, body, status, error_code, error_message, is_read, created_at";

/** send-sms / sms-webhook と同じ規則で E.164（+81…）に揃える */
export function toE164(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) return d;
  if (d.startsWith("0") && d.length >= 10) return "+81" + d.slice(1);
  return null;
}

/** +8190… → 090-…（表示用） */
export function formatJpPhone(e164: string): string {
  const local = e164.startsWith("+81") ? "0" + e164.slice(3) : e164;
  const m = local.match(/^(0\d{2})(\d{4})(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : local;
}

/** スレッドのキー＝お客様側の番号（送信は宛先、受信は送信元） */
export function counterpartNumber(log: Pick<SmsLog, "direction" | "to_number" | "from_number">): string {
  return log.direction === "inbound" ? log.from_number || "" : log.to_number;
}

export function outboundStatus(log: Pick<SmsLog, "status" | "error_code">): {
  label: string;
  className: string;
} {
  const s = log.status;
  if (s === "delivered") return { label: "配信済 ✓", className: "bg-emerald-100 text-emerald-700" };
  if (s === "undelivered" || s === "failed") {
    return {
      label: log.error_code ? `失敗（${log.error_code}）` : "失敗",
      className: "bg-rose-100 text-rose-700",
    };
  }
  return { label: "送信中", className: "bg-slate-100 text-slate-600" };
}
