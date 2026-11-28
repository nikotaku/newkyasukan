// O2 の店舗アカウントの「店舗情報編集」（/shop/profile/）に入れる連絡先と、フォームの送り直し（画面を開かない計算だけ。
// テスト tests/o2StoreContact.test.ts）。
//
// 2026-11 時点の画面：form（POST /shop/profile/、ロゴの file 欄があるので multipart）に csrf_token・shop_name・username・
// phone（tel）・business_hours・show_schedule / show_members（checkbox）・website_url・twitter_link・instagram_link・
// tiktok_link・bluesky_link・line_link・textarea description・select area_id / sub_area_id / job_type_id。
// メールは「登録メールアドレス（通知の届き先）」の表示だけで変えられない。外部ブログは O2 の店舗ページそのものなので入れない。
// テストで node から直接読むので、ほかのファイルは読まない（o2-store-post-page.ts の attributeMap / decodeHtml と同じもの）
import type { StoreContactValues } from "./estama-store-contact-plan.js";

const decodeHtml = (value: string) => value
  .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#([0-9]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replaceAll("&nbsp;", " ")
  .replaceAll("&quot;", '"')
  .replaceAll("&#039;", "'")
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&");

const attributeMap = (raw: string) => {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? "");
  }
  return attributes;
};

/** 050-1721-2589 の形（11桁は 3-4-4、10桁は 03 / 0X の市外局番を見ずに 3-3-4） */
export function hyphenatedPhone(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return "";
}

/** 変える欄（空の項目は触らない） */
export function o2ContactPlan(values: StoreContactValues) {
  const plan: Record<string, string> = {};
  const phone = hyphenatedPhone(values.phone);
  if (phone) plan.phone = phone;
  if (values.x_url && /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(values.x_url)) plan.twitter_link = values.x_url;
  if (values.line_url && /^https?:\/\//.test(values.line_url)) plan.line_link = values.line_url;
  return plan;
}

/** 入っている値が同じか（電話はハイフンの有無を見ない） */
export function sameO2Value(name: string, current: string | null | undefined, wanted: string) {
  const value = String(current ?? "").trim();
  if (name === "phone") return value.replace(/\D/g, "") === wanted.replace(/\D/g, "");
  return value === wanted;
}

/**
 * ブラウザが送るのと同じ中身（名前と値の並び）をフォームのHTMLから作る。
 * text/hidden などはそのまま、checkbox・radio はチェックされているものだけ、select は選ばれている option、textarea は中身。
 * file・ボタン・disabled の欄は送らない（ロゴは変えない）。
 */
export function o2FormEntries(formHtml: string): [string, string][] {
  const entries: { at: number; name: string; value: string }[] = [];
  for (const match of formHtml.matchAll(/<input\b([^>]*)>/gi)) {
    const attributes = attributeMap(match[1]);
    const type = (attributes.type || "text").toLowerCase();
    if (!attributes.name || /\bdisabled\b/i.test(match[1])) continue;
    if (["file", "submit", "button", "image", "reset"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(match[1])) continue;
    entries.push({ at: match.index ?? 0, name: attributes.name, value: attributes.value ?? (type === "checkbox" ? "on" : "") });
  }
  for (const match of formHtml.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const attributes = attributeMap(match[1]);
    if (!attributes.name || /\bdisabled\b/i.test(match[1])) continue;
    entries.push({ at: match.index ?? 0, name: attributes.name, value: decodeHtml(match[2]).replace(/^\r?\n/, "") });
  }
  for (const match of formHtml.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const attributes = attributeMap(match[1]);
    if (!attributes.name || /\bdisabled\b/i.test(match[1])) continue;
    const options = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|$)/gi)];
    const chosen = options.find((option) => /\bselected\b/i.test(option[1])) ?? options[0];
    if (!chosen) continue;
    const optionAttributes = attributeMap(chosen[1]);
    const value = optionAttributes.value ?? decodeHtml(chosen[2].replace(/<\/option>[\s\S]*$/i, "").replace(/<[^>]+>/g, "")).trim();
    entries.push({ at: match.index ?? 0, name: attributes.name, value });
  }
  return entries.sort((a, b) => a.at - b.at).map(({ name, value }) => [name, value]);
}

/** 送る中身に連絡先を入れる。欄が無ければ missing に入れる */
export function applyO2Contact(entries: [string, string][], plan: Record<string, string>) {
  const names = new Set(entries.map(([name]) => name));
  const missing = Object.keys(plan).filter((name) => !names.has(name));
  const next = entries.map(([name, value]): [string, string] => [name, name in plan ? plan[name] : value]);
  return { entries: next, missing };
}

/** 連絡先以外の欄が保存の前後で変わっていないか（変わった欄の名前。csrf_token は毎回変わるので見ない） */
export function unexpectedO2Changes(before: [string, string][], after: [string, string][], plan: Record<string, string>) {
  const map = (entries: [string, string][]) => {
    const values = new Map<string, string[]>();
    for (const [name, value] of entries) values.set(name, [...(values.get(name) ?? []), value.replace(/\r\n/g, "\n").trim()]);
    return values;
  };
  const a = map(before);
  const b = map(after);
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names].filter((name) => !(name in plan) && !/csrf|token/i.test(name)
    && JSON.stringify(a.get(name) ?? []) !== JSON.stringify(b.get(name) ?? []));
}
