// セラピストの精算：1つの予約の支払いを分ける（例：はじめの会計はカード、あとの追加オプションは現金）
import { calcPaymentFee, type PaymentSetting } from "./paymentFee.ts";

export type SplitRow = { method: string; amount: number };

export const MAX_SPLIT_ROWS = 4;

/** 分け始めの形：今までの支払い方法で前の金額、増えた分は別の方法（カードなら現金） */
export function initialSplit(originalMethod: string, originalPrice: number, newPrice: number): SplitRow[] {
  const first = Math.max(0, Math.min(originalPrice, newPrice));
  const secondMethod = originalMethod === "cash" ? "card" : "cash";
  return [
    { method: originalMethod, amount: first },
    { method: secondMethod, amount: Math.max(0, newPrice - first) },
  ];
}

/** 最後の行は残りの金額にそろえる（料金が変わっても合計が合うように） */
export function balanceSplit(rows: SplitRow[], price: number): SplitRow[] {
  if (rows.length === 0) return rows;
  const others = rows.slice(0, -1).reduce((sum, row) => sum + (row.amount || 0), 0);
  const last = rows[rows.length - 1];
  return [...rows.slice(0, -1), { ...last, amount: Math.max(0, price - others) }];
}

export function splitError(rows: SplitRow[], price: number): string | null {
  if (rows.length < 2) return "2つ以上に分けてください";
  if (rows.some((row) => !(row.amount > 0))) return "0円の支払いがあります";
  const sum = rows.reduce((total, row) => total + row.amount, 0);
  if (sum !== price) return `合計が料金（¥${price.toLocaleString()}）と合いません`;
  return null;
}

export function splitFee(rows: SplitRow[], settings: PaymentSetting[]): number {
  return rows.reduce((sum, row) => sum + calcPaymentFee(row.amount || 0, settings, row.method), 0);
}
