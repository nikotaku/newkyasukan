export type PaymentState = "paid" | "unpaid" | "upcoming" | "overdue";

export function scheduledPaymentDate(year: number, monthIndex: number, paymentDay: number | null) {
  if (!paymentDay) return null;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(paymentDay, 1), lastDay));
}

export function fixedCostPaymentState(input: {
  paymentDay: number | null;
  paid: boolean;
  recorded: boolean;
  selectedMonth: Date;
  today?: Date;
}): PaymentState {
  if (input.paid) return "paid";
  if (input.recorded) return "unpaid";
  const due = scheduledPaymentDate(
    input.selectedMonth.getFullYear(),
    input.selectedMonth.getMonth(),
    input.paymentDay,
  );
  if (!due) return "upcoming";
  const today = input.today ?? new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < todayDate ? "overdue" : "upcoming";
}

export function accountNumberTail(value: string | null | undefined) {
  const normalized = (value || "").replace(/\s/g, "");
  if (!normalized) return "";
  return normalized.length <= 4 ? normalized : `＊＊＊${normalized.slice(-4)}`;
}
