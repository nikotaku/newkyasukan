// 電話（SUBLINE）連携：管理画面の電話番号から店の050番号で発信する。
// スマホ … subline://?number=<番号> で同じ端末のSUBLINEアプリを開いて発信（公式kintoneプラグインと同じ）
// パソコン … Edge Function subline（action "call"）→ 設定したメンバーのスマホへ「発信してください」の通知
// 画面・呼び出しは src/components/phone/PhoneCallLink.tsx、設定は /settings/phone。

/** 電話番号を数字だけにする（+81 は 0 に） */
export function dialDigits(value: string | null | undefined) {
  const raw = String(value ?? "").trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+81") ? `0${digits.slice(3)}` : digits.replace(/\+/g, "");
}

/** スマホ（電話がかけられる端末）か。iPad は電話アプリが無いのでパソコン扱い */
export function isLikelyPhoneDevice(userAgent: string) {
  return /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(userAgent);
}

export function dialHref(phone: string, options: { subline: boolean; phoneDevice: boolean }) {
  const digits = dialDigits(phone);
  return options.subline && options.phoneDevice ? `subline://?number=${encodeURIComponent(digits)}` : `tel:${digits}`;
}
