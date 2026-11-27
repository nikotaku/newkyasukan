// 管理画面のヘッダーのベル：セラピストがマイページから送った精算（daily_sales_records）のうち、
// まだ承認していないもの（settlement_approvals にその日・その人の行が無い）。承認するまでベルに残る。
// 日別精算の「精算が届いています」と同じ判定。

export interface SettlementSubmission {
  cast_id: string | null;
  date: string;
  created_at: string;
  status?: string | null;
}

export interface SettlementApprovalKey {
  cast_id: string;
  date: string;
}

export interface PendingSettlement {
  castId: string;
  date: string;
  /** その日のいちばん新しい送信の時刻 */
  submittedAt: string;
}

/** ベルに出す日数（これより前の送信は日別精算の画面で見る） */
export const PENDING_SETTLEMENT_DAYS = 31;

const key = (castId: string, date: string) => `${castId}|${date}`;

/** まだ承認していない精算を、新しく届いた順に（同じ日・同じ人は1件） */
export function pendingSettlements(
  submissions: SettlementSubmission[],
  approvals: SettlementApprovalKey[],
): PendingSettlement[] {
  const approved = new Set(approvals.map((row) => key(row.cast_id, row.date)));
  const latest = new Map<string, PendingSettlement>();
  for (const row of submissions) {
    if (!row.cast_id || row.status === "cancelled") continue;
    const k = key(row.cast_id, row.date);
    if (approved.has(k)) continue;
    const prev = latest.get(k);
    if (!prev || row.created_at > prev.submittedAt) {
      latest.set(k, { castId: row.cast_id, date: row.date, submittedAt: row.created_at });
    }
  }
  return [...latest.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

/** 日別精算でその人の清算明細（承認の画面）を開くURL（スマホ通知と同じ） */
export const pendingSettlementUrl = (item: Pick<PendingSettlement, "castId" | "date">) =>
  `/sales/daily-sales?date=${item.date}&cast=${encodeURIComponent(item.castId)}`;

/** 「11/26(木) の精算」 */
export function settlementDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const week = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${week})`;
}
