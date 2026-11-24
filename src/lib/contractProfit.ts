/** Contract accounting only; never use as tax depreciation or cash balance. */
function yen(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("金額は0以上の整数円で入力してください");
  return value;
}
export function monthIndex(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("年月が不正です");
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m - 1;
}
export function shiftMonth(month: string, offset: number): string {
  const n = monthIndex(month) + offset;
  return String(Math.floor(n / 12)).padStart(4, "0") + "-" + String(n % 12 + 1).padStart(2, "0");
}
export function allocationSchedule(amount: number, months: number, start: string | null) {
  yen(amount);
  if (!Number.isSafeInteger(months) || months < 1 || months > 1200) throw new Error("配分期間が不正です");
  if (start === null) return [];
  const base = Math.floor(amount / months);
  return Array.from({ length: months }, (_, i) => ({
    month: shiftMonth(start, i),
    amount: i === months - 1 ? amount - base * (months - 1) : base,
  }));
}
export function allocationForMonth(amount: number, months: number, start: string | null, month: string) {
  monthIndex(month);
  return allocationSchedule(amount, months, start).find(row => row.month === month)?.amount ?? 0;
}
export function distribution(input: {
  sales: number; ordinaryExpenses: number; allocation: number; paidLoanPrincipal: number;
  investorRateBps?: number; investorEligible: boolean;
}) {
  const { sales, ordinaryExpenses, allocation, paidLoanPrincipal, investorEligible } = input;
  [sales, ordinaryExpenses, allocation, paidLoanPrincipal].forEach(yen);
  const rate = input.investorRateBps ?? 3000;
  if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw new Error("分配率が不正です");
  const distributableProfit = sales - ordinaryExpenses - allocation - paidLoanPrincipal;
  const positive = Math.max(0, distributableProfit);
  const investor = investorEligible ? Number(BigInt(positive) * BigInt(rate) / 10000n) : 0;
  return { distributableProfit, investor, operator: positive - investor };
}
/** Return installments are separate from the profit calculation. The month is the due month, not the earnings month. */
export function capitalReturnSchedule(receivedDate: string | null, total: number, installments: number) {
  if (receivedDate !== null && !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(receivedDate)) throw new Error("受領日が不正です");
  return allocationSchedule(total, installments, receivedDate === null ? null : shiftMonth(receivedDate.slice(0, 7), 2))
    .map(row => ({ ...row, nominalDueDate: row.month + "-15" }));
}
/** Supply a verified Japan bank holiday calendar; weekends and year-end bank closures are always excluded. */
export function nextBankBusinessDay(nominal: string, holidays: ReadonlySet<string>) {
  const d = new Date(nominal + "T00:00:00Z");
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== nominal) throw new Error("支払日が不正です");
  for (let i = 0; i < 31; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (![0, 6].includes(d.getUTCDay()) && !["12-31", "01-01", "01-02", "01-03"].includes(day.slice(5)) && !holidays.has(day)) return day;
  }
  throw new Error("銀行営業日を確定できません");
}
