// HPのニュースをO2（店舗アカウント）へ出すときの本文と画像。サーバー（server/o2-store-news.ts）とテストで使う。

/** O2の投稿本文の上限（空き状況の投稿と同じ） */
export const O2_NEWS_MAX_LENGTH = 1000;

/** 記事本文の見出し記号・強調などを外して、O2でそのまま読める文にする */
export function plainArticleText(content: string | null | undefined) {
  return (content ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 【タイトル】＋本文。上限を超えるときは本文を切って「…」を付け、最後にHPへのリンクを付ける。
 * siteUrl が無いときはリンクを付けずに切るだけ。
 */
export function buildO2NewsBody(title: string, content: string | null | undefined, siteUrl: string | null, limit = O2_NEWS_MAX_LENGTH) {
  const head = `【${title.trim()}】`;
  const text = plainArticleText(content);
  const full = text ? `${head}\n\n${text}` : head;
  if (full.length <= limit) return full;
  const tail = siteUrl ? `…\n\n続きはHPで👇\n${siteUrl}` : "…";
  const room = Math.max(0, limit - tail.length);
  return `${full.slice(0, room).trimEnd()}${tail}`;
}

/** O2に送れる画像の置き場所（サーバーの downloadImage と同じ決まり） */
export function isO2ImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname.endsWith(".supabase.co") || url.hostname === "drive.google.com" || url.hostname === "storage.googleapis.com");
  } catch {
    return false;
  }
}

/** 記事の1枚目の画像。無ければお店の画像（ロゴ → HPのトップバナー）を使う */
export function pickO2NewsImage(articleImages: readonly unknown[] | null | undefined, storeImages: readonly unknown[]) {
  return (articleImages ?? []).find(isO2ImageUrl) ?? storeImages.find(isO2ImageUrl) ?? null;
}
