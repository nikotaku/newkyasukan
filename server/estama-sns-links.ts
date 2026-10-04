// エステ魂のプロフィール「ブログ・SNS」に載せるURL。
// X(旧Twitter) 欄 … SNS運用管理（SNS連携）で保存したXのプロフィールURL（casts.x_account）
// 外部ブログ 欄 … O2のプロフィールURL（casts.o2_url）。O2が無い人だけ、今まで通り casts.blog_url
// どちらも保存のされ方がまちまち（@ID・twitter.com・/@ID 付きのURL）なので、決まった形に直してから送る。

const firstSegment = (value: string) => value.split(/[/?#\s]/, 1)[0] || "";

/** XのIDを取り出す（https://x.com/ID・https://twitter.com/@ID・@ID・ID のどれでも） */
export function normalizeXHandle(value: string | null | undefined) {
  const handle = firstSegment(String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, ""));
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : "";
}

/** O2のIDを取り出す（https://m-sns.net/profile/@ID・@ID・ID のどれでも） */
export function normalizeO2Handle(value: string | null | undefined) {
  const handle = firstSegment(String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?m-sns\.net\/profile\//i, "")
    .replace(/^@/, ""));
  return /^[A-Za-z0-9_.-]{1,64}$/.test(handle) ? handle : "";
}

export function estamaXProfileUrl(xAccount: string | null | undefined) {
  const handle = normalizeXHandle(xAccount);
  return handle ? `https://x.com/${handle}` : "";
}

export function estamaBlogUrl(o2Url: string | null | undefined, blogUrl: string | null | undefined) {
  const handle = normalizeO2Handle(o2Url);
  if (handle) return `https://m-sns.net/profile/@${handle}`;
  return String(blogUrl || "").trim();
}
