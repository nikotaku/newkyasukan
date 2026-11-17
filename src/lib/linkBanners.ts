// HPの「リンク一覧」（/links）に出す他社のリンクバナー。
// 保存先は stores.settings.link_banners（並び順のまま表示）と stores.settings.link_own_banner（当店の相互リンク用バナーの画像URL）。
// 管理画面はホームページダッシュボードの「リンク」タブ（src/pages/HpLinkBanners.tsx）、公開ページは src/pages/public/Links.tsx。
// 他社のHTMLコードは貼り付けで受け取るが、そのままHPに入れない（他社のスクリプトがHPで動くため）。
// コードから リンク先・画像・名前 だけを取り出し（parseLinkBannerCode）、こちらで <a><img></a> を作る。

export type LinkBanner = {
  id: string;
  /** サイト名（画像の代わりの文字・alt にも使う） */
  name: string;
  /** リンク先 */
  url: string;
  /** バナー画像。空なら文字のリンクで出す */
  image_url: string;
  /** false ならHPに出さない（データは残す） */
  enabled: boolean;
};

export const LINK_BANNER_NAME_MAX = 60;

/** http(s) のURLだけを通す（javascript: などはリンクにしない） */
export function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

const newId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `lb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 保存されている値（形が崩れていても）を表示・編集用にそろえる。リンク先が無いものは捨てる */
export function normalizeLinkBanners(raw: unknown): LinkBanner[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LinkBanner[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = safeHttpUrl(row.url);
    if (!url) continue;
    let id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const name = typeof row.name === "string" ? row.name.trim().slice(0, LINK_BANNER_NAME_MAX) : "";
    out.push({
      id,
      name: name || hostLabel(url),
      url,
      image_url: safeHttpUrl(row.image_url),
      enabled: row.enabled !== false,
    });
  }
  return out;
}

/** HPに出すもの（表示オンだけ・並び順のまま） */
export function visibleLinkBanners(raw: unknown): LinkBanner[] {
  return normalizeLinkBanners(raw).filter((banner) => banner.enabled);
}

/** サイト名が空のときの代わり（ドメイン名） */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 新しく足すバナー。入力が足りなければエラーの文を返す */
export function createLinkBanner(input: { name: string; url: string; image_url: string }): LinkBanner | string {
  const url = safeHttpUrl(input.url);
  if (!url) return "リンク先のURLを https:// から入れてください";
  const imageText = input.image_url.trim();
  const image_url = safeHttpUrl(imageText);
  if (imageText && !image_url) return "画像のURLは https:// から入れてください";
  const name = input.name.trim().slice(0, LINK_BANNER_NAME_MAX);
  return { id: newId(), name: name || hostLabel(url), url, image_url, enabled: true };
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 他社に貼ってもらう当店のリンク用HTML（相互リンク用） */
export function ownLinkBannerHtml(input: { siteUrl: string; imageUrl: string; name: string }): string {
  const site = escapeAttr(input.siteUrl);
  const image = escapeAttr(input.imageUrl);
  const name = escapeAttr(input.name);
  return image
    ? `<a href="${site}" target="_blank"><img src="${image}" alt="${name}" border="0"></a>`
    : `<a href="${site}" target="_blank">${name}</a>`;
}

const decodeEntities = (value: string) => value
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&nbsp;/gi, " ");

const attrOf = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  const raw = match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
  return decodeEntities(raw).trim();
};

/** // から始まるURLは https: を付ける */
const absoluteUrl = (value: string) => safeHttpUrl(value.startsWith("//") ? `https:${value}` : value);

const plainText = (html: string) =>
  decodeEntities(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * 相手のサイトにある「リンク用のHTMLコード」をそのまま貼ったものから、バナーを取り出す（何個でも）。
 * <a href="…"><img src="…" alt="…"></a> の形のほか、URLだけの行も1件にする。
 * <script> などはHPに入れない（取り出すのはリンク先・画像・名前だけ）。
 */
export function parseLinkBannerCode(code: string): Array<Omit<LinkBanner, "id" | "enabled">> {
  const found: Array<Omit<LinkBanner, "id" | "enabled">> = [];
  const seen = new Set<string>();
  const push = (url: string, image_url: string, name: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    found.push({ url, image_url, name: (name || hostLabel(url)).slice(0, LINK_BANNER_NAME_MAX) });
  };
  const withoutScripts = code.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  for (const match of withoutScripts.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const url = absoluteUrl(attrOf(match[1], "href"));
    if (!url) continue;
    const img = match[2].match(/<img\b[^>]*>/i)?.[0] ?? "";
    const image_url = img ? absoluteUrl(attrOf(img, "src")) : "";
    const name = (img && (attrOf(img, "alt") || attrOf(img, "title"))) || attrOf(match[1], "title") || plainText(match[2]);
    push(url, image_url, name);
  }
  if (!found.length) {
    for (const line of withoutScripts.split(/\s+/)) push(absoluteUrl(line), "", "");
  }
  return found;
}
