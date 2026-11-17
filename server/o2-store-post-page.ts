// O2の店舗アカウントの画面（投稿の作成・一覧・編集）を読むための部品。外部ライブラリなし（テスト: tests/o2StorePostPage.test.ts）。
//
// 2026-11 時点の画面：
// - 新規投稿 /shop/post/create/ … form#postForm（multipart）に csrf_token・textarea[name=content]・画像 image1〜3（file）。
//   送信ボタンは「投稿する（1pt消費）」だけで、status のような公開の指定は無い。
// - 投稿一覧 /shop/post/ … 各投稿へのリンクは /shop/post/edit/?id=<数字>。
// - 店舗の投稿は /post/?id= を開いてもトップへ戻されるので、掲載の確認は編集画面で行う。

export const O2_BASE = "https://m-sns.net";

export type HtmlForm = { action: string; method: string; html: string };
export type O2PostReference = { id: string; url: string };

export const decodeHtml = (value: string) => value
  .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#([0-9]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#039;", "'")
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

export const attributeMap = (raw: string) => {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2]);
  }
  return attributes;
};

export const formsFrom = (html: string, baseUrl: string): HtmlForm[] =>
  [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => {
    const attributes = attributeMap(match[1]);
    return {
      action: new URL(attributes.action || baseUrl, baseUrl).toString(),
      method: (attributes.method || "post").toUpperCase(),
      html: match[2],
    };
  });

export const fieldsFrom = (html: string, tag: "input" | "textarea" | "button") =>
  [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))]
    .map((match) => attributeMap(match[1]))
    .filter((attributes) => attributes.name);

export const hiddenFields = (html: string) => {
  const fields = new Map<string, string>();
  for (const attribute of fieldsFrom(html, "input")) {
    if ((attribute.type || "text").toLowerCase() === "hidden") fields.set(attribute.name, attribute.value || "");
  }
  return fields;
};

const BODY_FIELD = /^(content|body|text|message|post|caption)$/i;

/** 新規投稿の画面から、投稿のフォーム（本文欄と名前の付いた画像欄があるもの）を探す */
export function findO2StorePostForm(html: string, baseUrl: string) {
  for (const form of formsFrom(html, baseUrl)) {
    if (new URL(form.action).pathname.replace(/\/+$/, "") !== "/shop/post/create") continue;
    const bodyField = fieldsFrom(form.html, "textarea").find((field) => BODY_FIELD.test(field.name))?.name;
    const fileField = fieldsFrom(form.html, "input").find((field) => (field.type || "").toLowerCase() === "file")?.name;
    if (bodyField && fileField) return { form, bodyField, fileField };
  }
  return null;
}

/** /shop/post/edit/?id=N（一覧のリンク）と /post/?id=N から投稿IDを取り、確認用の編集画面のURLにする */
export function o2StorePostReferenceFromUrl(rawUrl: string): O2PostReference | null {
  try {
    const url = new URL(decodeHtml(rawUrl), O2_BASE);
    if (!/^(?:www\.)?m-sns\.net$/i.test(url.hostname)) return null;
    const path = url.pathname.replace(/\/+$/, "");
    if (path !== "/shop/post/edit" && path !== "/post") return null;
    const id = (url.searchParams.get("id") || "").trim();
    return /^\d+$/.test(id) ? { id, url: `${O2_BASE}/shop/post/edit/?id=${id}` } : null;
  } catch {
    return null;
  }
}

export function extractO2StorePostReferences(html: string, baseUrl: string) {
  const references = new Map<string, O2PostReference>();
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    let absolute: string;
    try {
      absolute = new URL(decodeHtml(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
    const reference = o2StorePostReferenceFromUrl(absolute);
    if (reference && !references.has(reference.id)) references.set(reference.id, reference);
  }
  return [...references.values()];
}

export const normalizeO2Text = (html: string) => decodeHtml(html)
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .normalize("NFC")
  .replace(/[​-‍﻿]/g, "")
  .replace(/\s+/g, " ")
  .trim();

/** 編集画面に、送った本文と画像が入っているか */
export function o2StorePostPageMatches(html: string, expectedBody: string) {
  const bodyMatches = normalizeO2Text(html).includes(normalizeO2Text(expectedBody));
  const imageMatches = [...html.matchAll(/<img\b([^>]*)>/gi)].some((match) => {
    const attributes = attributeMap(match[1]);
    if (/投稿画像/.test(`${attributes.alt || ""} ${attributes["aria-label"] || ""}`)) return true;
    try {
      return new URL(attributes.src || "", O2_BASE).hostname === "cdn.m-sns.net";
    } catch {
      return false;
    }
  }) || [...hiddenFields(html)].some(([name, value]) => /^tpl_image\d+$/.test(name) && value.trim() !== "");
  return bodyMatches && imageMatches;
}

/** 送り返された投稿画面に出ているエラーの文（ポイント不足・入力の不備など）。無ければ null */
export function o2StoreFormError(html: string) {
  for (const match of html.matchAll(/<(p|div|span|li)\b[^>]*class=["'][^"']*(?:error|alert|text-red|invalid)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = normalizeO2Text(match[2]);
    if (text) return text.slice(0, 120);
  }
  return null;
}
