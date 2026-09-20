export const BLOG_CATEGORY_LABELS: Record<string, string> = {
  news: "ニュース",
  coupon: "クーポン",
  schedule: "出勤情報",
  newstaff: "新人入店",
  campaign: "キャンペーン",
  tips: "ご利用ガイド",
  other: "お知らせ",
};

export const BLOG_CATEGORY_OPTIONS = [
  { value: "news", label: "ニュース" },
  { value: "tips", label: "ご利用ガイド・コラム" },
  { value: "campaign", label: "キャンペーン" },
  { value: "coupon", label: "クーポン案内" },
  { value: "schedule", label: "出勤情報" },
  { value: "newstaff", label: "新人入店情報" },
  { value: "other", label: "その他" },
] as const;

const stripMarkup = (value: string) => value
  .replace(/^#{1,6}\s+/gm, "")
  .replace(/\*\*(.*?)\*\*/g, "$1")
  .replace(/[*_`>#]/g, "")
  .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
  .replace(/\s+/g, " ")
  .trim();

export const blogCategoryLabel = (category: string | null | undefined) =>
  BLOG_CATEGORY_LABELS[category || ""] || "お知らせ";

export const blogExcerpt = (content: string | null | undefined, explicitExcerpt?: string | null, maxLength = 110) => {
  const supplied = stripMarkup(explicitExcerpt || "");
  if (supplied) return supplied.length > maxLength ? `${supplied.slice(0, maxLength)}…` : supplied;
  const source = stripMarkup(content || "");
  return source.length > maxLength ? `${source.slice(0, maxLength)}…` : source;
};

export const formatBlogDate = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
};

export const slugifyBlogTitle = (title: string) => {
  const normalized = title
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `article-${Date.now()}`;
};

export type BlogContentBlock =
  | { type: "h2" | "h3" | "paragraph" | "list"; text: string; items?: string[] };

export const blogContentBlocks = (content: string | null | undefined): BlogContentBlock[] => {
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: BlogContentBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const pushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const pushList = () => {
    if (list.length) blocks.push({ type: "list", text: "", items: list });
    list = [];
  };

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) {
      pushParagraph();
      pushList();
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      pushParagraph();
      pushList();
      blocks.push({ type: heading[1].length === 2 ? "h2" : "h3", text: heading[2] });
      continue;
    }
    const listItem = line.match(/^[-*・]\s+(.+)$/);
    if (listItem) {
      pushParagraph();
      list.push(listItem[1]);
      continue;
    }
    pushList();
    paragraph.push(line);
  }
  pushParagraph();
  pushList();
  return blocks;
};

export const isVideoUrl = (url: string) => /\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(url);

export type PublicBlogArticle = {
  id: string;
  store_id: string;
  title: string;
  slug: string | null;
  content: string | null;
  category: string | null;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  image_urls: string[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
