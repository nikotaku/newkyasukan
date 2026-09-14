export const ESTAMA_PROVISIONAL_CALLER_NUMBER = "0120286634";

export type InquiryClassificationInput = {
  channel: string;
  source: string;
  caller_number?: string | null;
};

/**
 * IVRYメール取り込みの発信者番号を比較できる形式に正規化する。
 * 国番号の +81 形式で保存された場合も、国内表記へ揃える。
 */
export const normalizeCallerNumber = (value: string | null | undefined): string => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.startsWith("81") && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
};

/**
 * エステ魂が仮予約通知に使用する番号からのIVRY着信かを判定する。
 */
export const isEstamaProvisionalReservation = (inquiry: InquiryClassificationInput): boolean =>
  inquiry.channel === "phone"
  && inquiry.source === "ivry_email"
  && normalizeCallerNumber(inquiry.caller_number) === ESTAMA_PROVISIONAL_CALLER_NUMBER;
