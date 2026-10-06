// 日別精算の承認（管理画面）と、セラピストのマイページへのお知らせ。
// 現金預かり（お客様から現金で受け取った分）が給与に足りないときは、足りない分（不足分）を
// 「振込」か「次回出勤日に相殺」で後からお店が払う。どちらにするかはセラピストがマイページで選ぶ。

import type { ClearanceExtraItem } from "./clearanceExtraItems";

export type ShortageMethod = "transfer" | "offset";

export const SHORTAGE_METHOD_LABELS: Record<ShortageMethod, string> = {
  transfer: "振込",
  offset: "次回出勤日に相殺",
};

export const BANK_ACCOUNT_TYPES = ["普通", "当座", "貯蓄"] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

const yen = (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`;
const toInt = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

/** 給与のうち、現金預かりで払いきれない分（お店があとで払う） */
export function settlementShortage(cashSales: number, salary: number) {
  return Math.max(0, toInt(salary) - toInt(cashSales));
}

/** 投函する現金（現金預かり − 給与）。足りないときは 0 */
export function settlementCashToDeposit(cashSales: number, salary: number) {
  return Math.max(0, toInt(cashSales) - toInt(salary));
}

/** マイページに出すお知らせ */
export function settlementAnnouncement(shortage: number) {
  return {
    title: "精算が承認されました",
    shortageText: shortage > 0
      ? `不足分 ${yen(shortage)} は、振込もしくは次回出勤日の相殺になります`
      : null,
  };
}

export interface OutstandingShortage {
  clearance_id: string;
  date: string;
  shortage_amount: number;
}

const monthDay = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return month && day ? `${month}/${day}` : date;
};

/** 「次回出勤日に相殺」を選んだ前回までの不足分を、今回の給与に上乗せする行にする */
export function offsetItemsFor(outstanding: OutstandingShortage[]): ClearanceExtraItem[] {
  return [...outstanding]
    .filter((row) => toInt(row.shortage_amount) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      label: `前回の不足分（${monthDay(row.date)}）`,
      amount: toInt(row.shortage_amount),
      kind: "salary_addition" as const,
      source_clearance_id: row.clearance_id,
    }));
}

/** 承認するときに「相殺済み」にする元の清算（金額が残っている相殺の行だけ） */
export function offsetClearanceIds(items: ClearanceExtraItem[]) {
  return [...new Set(
    items
      .filter((item) => item.kind === "salary_addition" && item.source_clearance_id && toInt(item.amount) > 0)
      .map((item) => item.source_clearance_id as string),
  )];
}

export interface BankAccountInput {
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_number: string;
  account_holder: string;
}

const toHalfWidthDigits = (value: string) => value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
const hiraganaToKatakana = (value: string) => value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));

/** 振込先の入力をそろえて確かめる（口座番号は7桁にそろえる・名義はカタカナ） */
export function normalizeBankAccount(input: BankAccountInput):
  | { ok: true; value: BankAccountInput }
  | { ok: false; error: string } {
  const bankName = input.bank_name.trim();
  const branchName = input.branch_name.trim();
  const accountType = input.account_type.trim();
  const digits = toHalfWidthDigits(input.account_number).replace(/[\s-－ー]/g, "");
  // 名義の区切りは全角スペースにそろえる
  const holder = hiraganaToKatakana(input.account_holder.trim()).replace(/[\s\u3000]+/g, "\u3000");

  if (!bankName) return { ok: false, error: "銀行名を入力してください" };
  if (!branchName) return { ok: false, error: "支店名を入力してください" };
  if (!(BANK_ACCOUNT_TYPES as readonly string[]).includes(accountType)) return { ok: false, error: "口座の種類を選んでください" };
  if (!/^\d{1,8}$/.test(digits)) return { ok: false, error: "口座番号は数字で入力してください" };
  if (!holder) return { ok: false, error: "口座名義（カタカナ）を入力してください" };
  if (!/^[ァ-ヴー\u3000]+$/.test(holder)) return { ok: false, error: "口座名義はカタカナで入力してください" };
  if (bankName.length > 40 || branchName.length > 40 || holder.length > 60) {
    return { ok: false, error: "入力が長すぎます" };
  }

  return {
    ok: true,
    value: {
      bank_name: bankName,
      branch_name: branchName,
      account_type: accountType,
      account_number: digits.length < 7 ? digits.padStart(7, "0") : digits,
      account_holder: holder,
    },
  };
}

/** 口座番号は末尾4桁だけ見せる */
export function maskedAccountNumber(last4: string | null | undefined) {
  return last4 ? `＊＊＊${last4}` : "";
}
