// SMS本文のテンプレート処理（send-sms）。
// テンプレ変数: {name} {date} {date_long} {time} {course} {duration} {cast} {nomination} {price}
//              {room} {room_address} {room_landmark} {room_map} {guide_url}
// 値が空の変数を含む行は自動で削除される。

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.split("\n").flatMap((line) => {
    let empty = false;
    const out = line.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (!(key in values)) return match;
      if (!values[key]) empty = true;
      return values[key];
    });
    return empty ? [] : [out];
  }).join("\n");
}

// 予約ごとの案内ページ（/g/:token）のURL。店舗の独自ドメインがなければ出さない
export function reservationGuideUrl(customDomain: string | null | undefined, token: string | null | undefined) {
  const domain = (customDomain || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!domain || !token || !/^[A-Za-z0-9_-]{12,32}$/.test(token)) return "";
  return `https://${domain}/g/${token}`;
}

export function toE164(raw: string): string | null {
  const d = (raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("0") && d.length >= 10) return "+81" + d.slice(1);
  return null;
}
