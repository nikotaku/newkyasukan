export interface PaymentSetting {
  id: string;
  payment_method: string;
  payment_link: string | null;
  fee_percentage: number;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  card: "カード",
  paypay: "PayPay",
};

export function findPaymentSetting(
  settings: PaymentSetting[],
  methodCode: string
): PaymentSetting | null {
  if (methodCode === "card") {
    return settings.find((s) => /クレジット|カード|card/i.test(s.payment_method)) ?? null;
  }
  if (methodCode === "paypay") {
    return settings.find((s) => /paypay/i.test(s.payment_method)) ?? null;
  }
  return null;
}

export function calcPaymentFee(
  baseAmount: number,
  settings: PaymentSetting[],
  methodCode: string
): number {
  const setting = findPaymentSetting(settings, methodCode);
  if (!setting) return 0;
  return Math.round((baseAmount * (Number(setting.fee_percentage) || 0)) / 100);
}
