/**
 * deduction       … 給与から引く（その他控除）
 * salary_addition … 追加支給（講習手当・本指名バックなど）。給与として経費に入る
 * shortage_offset … 前回までの給与の不足分を今回の現金で相殺した分。前回の精算で給与に入っているので、
 *                   今回の売上・経費（月の利益）には入れない。今回の受け取り（現金の流れ）にだけ入る
 * cash_return     … お客様へのキャッシュバック・セラピストの財布からの返金をお店が返す分（reservation_cash_returns）。
 *                   お店の負担なので売上から引く。給与（バック）ではないので経費の給与には入れない
 */
export type ClearanceExtraItemKind = "deduction" | "salary_addition" | "shortage_offset" | "cash_return";

export interface ClearanceExtraItem {
  label: string;
  amount: number;
  kind: ClearanceExtraItemKind;
  /** 前回の不足分を相殺する行だけ：相殺する元の清算（daily_clearances.id） */
  source_clearance_id?: string;
  /** 返金・キャッシュバックの行だけ：元の記録（reservation_cash_returns.id） */
  source_return_id?: string;
}

const toAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

/**
 * Legacy rows do not have a kind. They were always salary deductions, so they
 * must continue to be treated as deductions for backwards compatibility.
 */
export function splitClearanceExtraItems(value: unknown): {
  deductions: ClearanceExtraItem[];
  salaryAdditions: ClearanceExtraItem[];
} {
  const deductions: ClearanceExtraItem[] = [];
  const salaryAdditions: ClearanceExtraItem[] = [];

  if (!Array.isArray(value)) return { deductions, salaryAdditions };

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const kind: ClearanceExtraItemKind =
      item.kind === "salary_addition" || item.kind === "shortage_offset" || item.kind === "cash_return"
        ? item.kind
        : "deduction";
    const normalized: ClearanceExtraItem = {
      label: typeof item.label === "string" ? item.label : "",
      amount: toAmount(item.amount),
      kind,
      ...(typeof item.source_clearance_id === "string" ? { source_clearance_id: item.source_clearance_id } : {}),
      ...(typeof item.source_return_id === "string" ? { source_return_id: item.source_return_id } : {}),
    };

    // 給与に上乗せする行（追加支給・不足分の相殺）は同じ欄で入力・表示する
    if (kind !== "deduction") salaryAdditions.push(normalized);
    else deductions.push(normalized);
  }

  return { deductions, salaryAdditions };
}

export function combineClearanceExtraItems(
  deductions: ClearanceExtraItem[],
  salaryAdditions: ClearanceExtraItem[],
  options?: { keepZeroAmount?: boolean }
): ClearanceExtraItem[] {
  const normalize = (
    items: ClearanceExtraItem[],
    kind: ClearanceExtraItemKind,
    fallbackLabel: string
  ) => items
    .map((item) => ({
      label: item.label.trim() || fallbackLabel,
      amount: toAmount(item.amount),
      kind: kind === "salary_addition" && isCashReturn(item)
        ? "cash_return" as const
        : kind === "salary_addition" && isShortageOffset(item) ? "shortage_offset" as const : kind,
      ...(item.source_clearance_id ? { source_clearance_id: item.source_clearance_id } : {}),
      ...(item.source_return_id ? { source_return_id: item.source_return_id } : {}),
    }))
    // keepZeroAmount=true のときは金額未入力（0円）の入力途中項目も保持する
    .filter((item) => options?.keepZeroAmount || item.amount > 0);

  return [
    ...normalize(deductions, "deduction", "その他控除"),
    ...normalize(salaryAdditions, "salary_addition", "追加支給"),
  ];
}

export const sumClearanceExtraItems = (items: ClearanceExtraItem[]): number =>
  items.reduce((sum, item) => sum + toAmount(item.amount), 0);

/** お客様への返金・キャッシュバックをお店が返す行か */
export const isCashReturn = (item: Pick<ClearanceExtraItem, "kind" | "source_return_id">): boolean =>
  item.kind === "cash_return" || !!item.source_return_id;

/** 前回までの給与の不足分を相殺する行か（前回の精算を指している行も相殺として扱う） */
export const isShortageOffset = (item: Pick<ClearanceExtraItem, "kind" | "source_clearance_id" | "source_return_id">): boolean =>
  !isCashReturn(item) && (item.kind === "shortage_offset" || !!item.source_clearance_id);

/**
 * 給与に上乗せする行を、追加支給（経費になる）・不足分の相殺（利益に関係しない）・
 * 返金・キャッシュバック（売上から引く）に分ける
 */
export function splitSalaryAdjustments(items: ClearanceExtraItem[]) {
  const returns = items.filter((item) => isCashReturn(item));
  const offsets = items.filter((item) => isShortageOffset(item));
  const additions = items.filter((item) => !isCashReturn(item) && !isShortageOffset(item));
  return {
    additions,
    offsets,
    returns,
    additionTotal: sumClearanceExtraItems(additions),
    offsetTotal: sumClearanceExtraItems(offsets),
    returnTotal: sumClearanceExtraItems(returns),
  };
}
