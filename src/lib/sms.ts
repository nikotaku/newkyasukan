// SMSアプリ起動用ヘルパー（モバイル向け。PCでは sms: スキーム非対応の場合あり）

export function smsHref(phone: string, body: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  // iOS は区切りに & を使う（? だと本文が無視される端末がある）
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const sep = isIOS ? "&" : "?";
  return `sms:${cleaned}${sep}body=${encodeURIComponent(body)}`;
}

export function openSmsApp(phone: string, body: string) {
  window.location.href = smsHref(phone, body);
}
