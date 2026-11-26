// 教育の「ゴール」タブ：セラピストごとの最終的なゴール（文章）と、1か月の売上・本数・本指名率の目標。
// 実績は予約（完了＝施術済み）から数える。月は営業日（朝6時切り替え）で見る。画面は src/components/education/CastGoalsBoard.tsx

import { businessDateTime } from "./businessTime.ts";

export interface CastGoal {
  cast_id: string;
  goal_text: string | null;
  monthly_sales_target: number | null;
  monthly_count_target: number | null;
  honshimei_rate_target: number | null;
  updated_at?: string | null;
}

export interface GoalReservation {
  cast_id: string | null;
  reservation_date: string;
  start_time: string | null;
  status: string;
  price: number | null;
  nomination_type: string | null;
}

export interface MonthActual {
  /** 施術済みの売上（予約の料金の合計） */
  sales: number;
  /** 施術済みの本数 */
  count: number;
  /** 施術済みのうち本指名（姫予約を含む）の本数 */
  honshimei: number;
  /** 本指名率（%）。施術が0本なら null */
  honshimeiRate: number | null;
  /** その月のこれからの予約（確定のまま）の本数・売上 */
  plannedCount: number;
  plannedSales: number;
}

/** 本指名に数える指名の種類（姫予約＝本指名のお客様の事前予約なので含める） */
export const HONSHIMEI_TYPES = ["本指名", "姫予約"];
export const isHonshimei = (type: string | null | undefined) => HONSHIMEI_TYPES.includes((type ?? "").trim());

export type GoalAudience = "zaiseki" | "repeat" | "dekasegi" | "other";

export const AUDIENCE_LABEL: Record<GoalAudience, string> = {
  zaiseki: "在籍",
  repeat: "出稼ぎ（リピート）",
  dekasegi: "出稼ぎ（初回）",
  other: "その他",
};

/**
 * ゴールを決める相手かどうか。在籍（tags に「在籍」、または「出稼ぎ」でない人）と、
 * 出稼ぎで出勤した月が2か月以上ある人（リピート）が対象。
 */
export function goalAudience(tags: string[] | null | undefined, shiftMonths: number): GoalAudience {
  const list = tags ?? [];
  if (list.includes("在籍")) return "zaiseki";
  if (list.includes("出稼ぎ")) return shiftMonths >= 2 ? "repeat" : "dekasegi";
  return "zaiseki";
}

export const isGoalTarget = (audience: GoalAudience) => audience === "zaiseki" || audience === "repeat";

/** 予約の営業日（YYYY-MM-DD）。朝6時前は前日 */
export const reservationBusinessDate = (r: Pick<GoalReservation, "reservation_date" | "start_time">) =>
  businessDateTime(r.reservation_date, r.start_time)?.date ?? r.reservation_date;

/** その月（YYYY-MM）の実績。完了は実績、確定（confirmed）のままの予約は予定として別に数える */
export function monthActual(reservations: GoalReservation[], castId: string, month: string): MonthActual {
  let sales = 0, count = 0, honshimei = 0, plannedCount = 0, plannedSales = 0;
  for (const r of reservations) {
    if (r.cast_id !== castId) continue;
    if (!reservationBusinessDate(r).startsWith(month)) continue;
    const price = Number(r.price) || 0;
    if (r.status === "completed") {
      sales += price;
      count += 1;
      if (isHonshimei(r.nomination_type)) honshimei += 1;
    } else if (r.status === "confirmed") {
      plannedCount += 1;
      plannedSales += price;
    }
  }
  return {
    sales, count, honshimei,
    honshimeiRate: count > 0 ? Math.round((honshimei / count) * 1000) / 10 : null,
    plannedCount, plannedSales,
  };
}

/** 目標に対する達成率（%、0〜999）。目標が無い・0なら null */
export function achievement(actual: number | null, target: number | null | undefined): number | null {
  if (target == null || target <= 0 || actual == null) return null;
  return Math.min(999, Math.round((actual / target) * 100));
}

/** 出勤した月の数（cast_id ごと） */
export function shiftMonthCounts(shifts: { cast_id: string | null; shift_date: string }[]): Map<string, number> {
  const months = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!s.cast_id) continue;
    const set = months.get(s.cast_id) ?? new Set<string>();
    set.add(s.shift_date.slice(0, 7));
    months.set(s.cast_id, set);
  }
  return new Map([...months].map(([id, set]) => [id, set.size]));
}

/** 入力欄の文字を数に（全角・カンマ・円・% を許す）。空や読めないものは null */
export function parseGoalNumber(value: string, { max, decimals = 0 }: { max: number; decimals?: number }): number | null {
  const text = value.replace(/[０-９．]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[,，円¥￥%％本\s]/g, "");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  const factor = 10 ** decimals;
  return Math.min(max, Math.round(n * factor) / factor);
}
