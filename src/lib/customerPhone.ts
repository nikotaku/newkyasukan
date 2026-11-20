// お客様が予約フォームで入れる電話番号のチェック。
// 予約の確認はSMSで送るので、携帯電話の番号（070・080・090 で始まる11桁）だけ受け付ける。
// 全角の数字・ハイフン・空白・+81 は受け付けて、保存はハイフンなしの数字だけにそろえる（既存のWEB予約と同じ形）。

/** 携帯電話の番号（ハイフンなし） */
export const MOBILE_PHONE_PATTERN = /^0[789]0\d{8}$/;

/** 入力を数字だけにそろえる（全角→半角、+81 → 0、ハイフン・空白・かっこを外す） */
export function normalizeCustomerPhone(input: string): string {
  let digits = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/＋/g, "+")
    .trim();
  digits = digits.replace(/^\+?81[\s\-－ー―‐()（）]*/, "0").replace(/\D/g, "");
  // +81 のあとに 0 を付けて入れた人（+81 090…）
  if (/^00[789]0\d{8}$/.test(digits)) digits = digits.slice(1);
  return digits;
}

/** 携帯電話の番号として正しければ、ハイフンなしの番号を返す。違えばエラーの文を返す */
export function checkCustomerPhone(input: string): { ok: true; phone: string } | { ok: false; message: string } {
  const phone = normalizeCustomerPhone(input);
  if (!phone) return { ok: false, message: "電話番号を入力してください" };
  if (MOBILE_PHONE_PATTERN.test(phone)) return { ok: true, phone };
  if (/^0[789]0\d*$/.test(phone)) {
    return { ok: false, message: `携帯電話の番号は11桁です（今は${phone.length}桁）。もう一度ご確認ください` };
  }
  return { ok: false, message: "SMSを受け取れる携帯電話の番号（090・080・070から始まる11桁）を入力してください" };
}
