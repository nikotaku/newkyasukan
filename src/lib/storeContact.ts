// 艶華OSの「連絡先・SNS（正本）」：店舗情報の 電話・公式LINE・メール・X・外部ブログ（O2の店舗ページ）。
// 画面は src/pages/StoreContactMaster.tsx、テスト npm run test:store-contact。

export interface ContactValues {
  phone: string;
  line_url: string;
  email: string;
  x_url: string;
  blog_url: string;
}

export const CONTACT_FIELDS: Array<{ key: keyof ContactValues; label: string; placeholder: string; hint: string }> = [
  { key: "phone", label: "電話番号", placeholder: "050-1234-5678", hint: "ハイフンは付けても付けなくても大丈夫です（保存は数字だけ）" },
  { key: "line_url", label: "公式LINE", placeholder: "https://lin.ee/…", hint: "お客様向けの公式LINEの友だち追加URL" },
  { key: "email", label: "メールアドレス", placeholder: "info@example.jp", hint: "お客様向けのお問い合わせ先" },
  { key: "x_url", label: "Xアカウント", placeholder: "@enka_sendai3 または https://x.com/…", hint: "@ID でもURLでも入れられます（保存は https://x.com/ID）" },
  { key: "blog_url", label: "外部ブログ（O2の店舗ページ）", placeholder: "https://m-sns.net/s/@…", hint: "各媒体の「ブログ」欄にこのURLを入れます" },
];

export const CONTACT_TARGETS: Array<{ label: string; note: string; syncKey: "estama" | "o2" | null }> = [
  { label: "公式HP", note: "ヘッダー・フッター・予約ページ・SNSリンク（店舗情報をそのまま読む）", syncKey: null },
  { label: "SMS・予約案内ページ", note: "お客様へのSMS・予約案内ページ・公式LINEの自動応答の連絡先", syncKey: null },
  { label: "エステ魂の店舗ページ", note: "店舗基本情報の電話・メール・LINE・X・ブログ欄を自動で書き換える", syncKey: "estama" },
  { label: "O2の店舗アカウント", note: "店舗情報編集の電話・X・LINEを自動で書き換える（メールは変えられない欄・ブログはO2の店舗ページそのもの）。結果は「エスたま自動化履歴」にも残る", syncKey: "o2" },
];

const toHalfWidth = (value: string) => value.normalize("NFKC").trim();

/** X の @ID・URL を https://x.com/ID にそろえる（読めなければそのまま） */
export function normalizeXUrl(value: string): string {
  const raw = toHalfWidth(value);
  if (!raw) return "";
  const handle = raw.replace(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//i, "").replace(/^@/, "").split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `https://x.com/${handle}` : raw;
}

export function normalizeContact(values: ContactValues): ContactValues {
  return {
    phone: toHalfWidth(values.phone).replace(/[^\d]/g, ""),
    line_url: toHalfWidth(values.line_url),
    email: toHalfWidth(values.email).toLowerCase(),
    x_url: normalizeXUrl(values.x_url),
    blog_url: toHalfWidth(values.blog_url),
  };
}

const isHttpUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);

/** 入れ方がおかしいときの理由（問題なければ null） */
export function validateContact(values: ContactValues, isValidEmail: (email: string) => boolean): string | null {
  if (!/^0\d{9,10}$/.test(values.phone)) return "電話番号は0から始まる10桁か11桁で入れてください";
  if (values.line_url && !/^https:\/\/(lin\.ee|line\.me)\//i.test(values.line_url)) return "公式LINEは https://lin.ee/… か https://line.me/… のURLを入れてください";
  if (values.email && !isValidEmail(values.email)) return "メールアドレスの形式が正しくありません";
  if (values.x_url && !/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(values.x_url)) return "Xは @ID か https://x.com/ID の形で入れてください";
  if (values.blog_url && !isHttpUrl(values.blog_url)) return "外部ブログは https:// から始まるURLを入れてください";
  return null;
}
