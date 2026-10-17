/**
 * お客様へのキャッシュバック・セラピストの財布からの返金（reservation_cash_returns）。
 * 起きた予約に記録すると、その日の日別精算に「返金・キャッシュバック」の行として自動で入り、
 * お店がセラピストに返す（お店の負担・売上から引く。セラピストの取り分は返金前のまま）。
 */
import type { ClearanceExtraItem } from "./clearanceExtraItems.ts";

export type CashReturnKind = "cashback" | "refund";
export type CashReturnSource = "staff" | "therapist";

export interface CashReturn {
  id: string;
  reservation_id: string;
  cast_id?: string | null;
  kind: CashReturnKind;
  amount: number;
  reason: string;
  note: string | null;
  source: CashReturnSource;
  created_at: string;
}

export const CASH_RETURN_KINDS: { value: CashReturnKind; label: string; hint: string }[] = [
  { value: "cashback", label: "キャッシュバック", hint: "お客様にお金をお返しした（お店の負担）" },
  { value: "refund", label: "返金", hint: "セラピストの財布などからお客様に返金した" },
];

export const CASH_RETURN_REASONS = ["施術時間不足", "クレーム対応", "お釣りの返し忘れ", "その他"] as const;

export const cashReturnKindLabel = (kind: string): string =>
  CASH_RETURN_KINDS.find((item) => item.value === kind)?.label ?? "返金";

const toAmount = (value: unknown): number => {
  const amount = Math.round(Number(value));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

/** 精算の行の名前：「キャッシュバック（田中様・施術時間不足）」。本人の申告は「本人申告」を付ける */
export function cashReturnLabel(item: Pick<CashReturn, "kind" | "reason" | "source">, customerName?: string | null): string {
  const parts = [customerName?.trim() ? `${customerName.trim()}様` : "", item.reason?.trim() ?? ""].filter(Boolean);
  const detail = parts.length ? `（${parts.join("・")}）` : "";
  return `${cashReturnKindLabel(item.kind)}${detail}${item.source === "therapist" ? "［本人申告］" : ""}`;
}

export function cashReturnItem(item: CashReturn, customerName?: string | null): ClearanceExtraItem {
  return {
    label: cashReturnLabel(item, customerName),
    amount: toAmount(item.amount),
    kind: "cash_return",
    source_return_id: item.id,
  };
}

export const cashReturnTotal = (items: Pick<CashReturn, "amount">[]): number =>
  items.reduce((sum, item) => sum + toAmount(item.amount), 0);

/**
 * まだ締めていない精算の「給与に上乗せする行」に、その日の返金・キャッシュバックをそろえる。
 * 記録にあって行に無いものは足し、取り消された（記録に無い）返金の行は外す。手で入れた行はそのまま。
 */
export function syncCashReturnItems(
  items: ClearanceExtraItem[],
  returns: CashReturn[],
  customerNameOf: (reservationId: string) => string | null | undefined = () => null,
): ClearanceExtraItem[] {
  const activeIds = new Set(returns.map((item) => item.id));
  const kept = items.filter((item) => !item.source_return_id || activeIds.has(item.source_return_id));
  const present = new Set(kept.map((item) => item.source_return_id).filter(Boolean));
  const added = returns
    .filter((item) => !present.has(item.id) && toAmount(item.amount) > 0)
    .map((item) => cashReturnItem(item, customerNameOf(item.reservation_id)));
  return [...kept, ...added];
}

/** 締めた精算に入っていない返金・キャッシュバック（精算の後に記録されたもの） */
export function unreflectedCashReturns(items: ClearanceExtraItem[], returns: CashReturn[]): CashReturn[] {
  const present = new Set(items.map((item) => item.source_return_id).filter(Boolean));
  return returns.filter((item) => !present.has(item.id));
}
