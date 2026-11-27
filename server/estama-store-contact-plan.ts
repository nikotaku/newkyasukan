// エステ魂の店舗基本情報に入れる連絡先の値（画面を開かない計算だけ。テスト tests/estamaStoreContact.test.ts）

export interface StoreContactValues {
  phone: string | null;
  line_url: string | null;
  email: string | null;
  x_url: string | null;
  blog_url: string | null;
}

/** 電話番号を エステ魂の3つの欄 に分ける（11桁は 3-4-4、10桁は 3-3-4） */
export function splitEstamaPhone(phone: string | null | undefined): [string, string, string] | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11) return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  if (digits.length === 10) return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  return null;
}

/** https://x.com/ID → ID（エステ魂の twitter_id 欄は @ なしのID） */
export function estamaTwitterId(xUrl: string | null | undefined): string {
  const handle = String(xUrl ?? "").trim()
    .replace(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : "";
}

/** 画面に入れる値（空の項目は触らない） */
export function estamaContactPlan(values: StoreContactValues) {
  const tel = splitEstamaPhone(values.phone);
  const contact: Record<string, string> = {};
  if (tel) tel.forEach((part, index) => { contact[`tel[${index}]`] = part; });
  if (values.email) contact.sub_mail = values.email;
  if (values.line_url) contact.shop_line_url = values.line_url;
  const info: Record<string, string> = {};
  const twitter = estamaTwitterId(values.x_url);
  if (twitter) info.twitter_id = twitter;
  if (values.blog_url) info.blog_url = values.blog_url;
  return { contact, info };
}

