export type EstamaNewsAdminLink = { href: string; text: string };

const normalize = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase("ja-JP")
  .replace(/\s+/g, "")
  .trim();

export function estamaNewsAdminLinkScore(link: EstamaNewsAdminLink) {
  let parsed: URL;
  try {
    parsed = new URL(link.href);
  } catch {
    return -1;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "estama.jp" || !parsed.pathname.startsWith("/admin/")) {
    return -1;
  }

  const text = normalize(link.text);
  const path = normalize(`${parsed.pathname}${parsed.search}`);
  const combined = `${text}${path}`;
  if (/logout|signout|tamathera|diary|cast|therapist|recruit|job/.test(combined)) return -1;

  let score = 0;
  if (/(?:店舗|お店|ショップ)(?:ニュース|新着|お知らせ)/.test(text)) score += 120;
  if (/(?:ニュース|新着|お知らせ)(?:管理|登録|編集)/.test(text)) score += 100;
  if (["ニュース", "新着メッセージ", "お知らせ"].includes(text)) score += 80;
  if (/(?:news|topic|message|information)/.test(path)) score += 45;
  if (/ニュース|新着|お知らせ/.test(text)) score += 30;
  return score;
}

export function chooseEstamaNewsAdminLink(links: EstamaNewsAdminLink[]) {
  const ranked = links
    .map((link) => ({ ...link, score: estamaNewsAdminLinkScore(link) }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score || a.href.length - b.href.length);
  return ranked[0] ?? null;
}

export function normalizeEstamaNewsText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function countEstamaNewsTitle(source: string, title: string) {
  const haystack = normalizeEstamaNewsText(source);
  const needle = normalizeEstamaNewsText(title);
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

export type EstamaNewsPublicationEvidence = {
  publicCountBefore: number;
  publicCountAfter: number;
  successVisible: boolean;
  formVisible: boolean;
  currentBody: string | null;
  submittedBody: string;
  confirmationVisible: boolean;
};

export function isConfirmedEstamaNewsPublication(evidence: EstamaNewsPublicationEvidence) {
  if (evidence.confirmationVisible) return false;
  if (evidence.publicCountAfter > evidence.publicCountBefore) return true;
  if (evidence.successVisible) return true;
  if (!evidence.formVisible) return false;
  return evidence.currentBody !== null
    && evidence.submittedBody.trim().length > 0
    && evidence.currentBody.trim() === "";
}
