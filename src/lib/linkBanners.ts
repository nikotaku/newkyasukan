// HPの「リンク一覧」（/links）に出す他社のリンクバナー。
// 保存先は stores.settings.link_banners（並び順のまま表示）と stores.settings.link_own_banner（当店の相互リンク用バナーの画像URL）。
// 管理画面はホームページダッシュボードの「リンク」タブ（src/pages/HpLinkBanners.tsx）、公開ページは src/pages/public/Links.tsx。
// 他社のHTMLコードはそのまま貼らない（他社のスクリプトがHPで動くため）。画像とリンク先だけを持ち、こちらで <a><img></a> を作る。

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
