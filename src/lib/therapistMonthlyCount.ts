// セラピストのマイページ：その月の本数（施術済み・予定）。読み込みは本人のトークンで RPC get_therapist_monthly_counts
// （画面は src/components/therapist/TherapistMonthlyCount.tsx）。月は営業日（朝6時切り替え）で数える。

export interface MonthlyCountRow {
  done: number;
  scheduled: number;
}

export interface TherapistMonthlyCounts extends MonthlyCountRow {
  month: string;
  nominations: Array<MonthlyCountRow & { label: string }>;
  durations: Array<MonthlyCountRow & { minutes: number }>;
  days: Array<MonthlyCountRow & { date: string }>;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 営業月（朝6時までは前日扱い）を "YYYY-MM" で */
export function businessMonth(now: Date) {
  const shifted = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`;
}

/** "YYYY-MM" を delta か月ずらす */
export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** "2026-10" → "10月"（年が違うときは "2025年12月"） */
export function monthLabel(month: string, currentMonth: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const [currentYear] = currentMonth.split("-").map(Number);
  return year === currentYear ? `${monthNumber}月` : `${year}年${monthNumber}月`;
}

/** 本数の合計（施術済み＋予定） */
export const totalCount = (row: MonthlyCountRow) => row.done + row.scheduled;

const toCount = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

/** RPC の結果を画面で使う形にそろえる */
export function normalizeMonthlyCounts(raw: unknown, month: string): TherapistMonthlyCounts {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
  return {
    month: typeof data.month === "string" ? data.month : month,
    done: toCount(data.done),
    scheduled: toCount(data.scheduled),
    nominations: list(data.nominations).map((row) => ({
      label: String(row.label || "フリー"),
      done: toCount(row.done),
      scheduled: toCount(row.scheduled),
    })),
    durations: list(data.durations)
      .map((row) => ({ minutes: toCount(row.minutes), done: toCount(row.done), scheduled: toCount(row.scheduled) }))
      .filter((row) => row.minutes > 0),
    days: list(data.days)
      .filter((row) => typeof row.date === "string")
      .map((row) => ({ date: String(row.date).slice(0, 10), done: toCount(row.done), scheduled: toCount(row.scheduled) })),
  };
}
