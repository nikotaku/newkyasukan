// 着信ポップ（CtiCallPopup）→ 予約入力（/admin-schedule の新規予約）へ電話番号を渡す。
// 予約入力は電話番号が入ると、お客様の情報（来店・NG・好み）を自動で出す（ReservationForm）。

import { dialDigits } from "./sublinePhone.ts";

export const CALL_PARAM = "call";

/** 着信の電話番号で予約入力を開くURL */
export function reservationUrlForCall(phone: string) {
  const digits = dialDigits(phone);
  return digits ? `/admin-schedule?${CALL_PARAM}=${encodeURIComponent(digits)}` : "/admin-schedule";
}

/** 予約入力のURLから着信の電話番号を取り出す（電話番号の形でなければ null） */
export function phoneFromCallParam(search: string) {
  const value = new URLSearchParams(search).get(CALL_PARAM);
  const digits = dialDigits(value);
  return /^0\d{9,10}$/.test(digits) ? digits : null;
}
