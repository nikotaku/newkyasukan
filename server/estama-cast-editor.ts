// エステ魂の「セラピスト編集」画面の決め方。
// /admin/cast_edit/（IDなし）は新規登録の画面なので、エステ魂に載っているセラピストの更新に使ってはいけない
// （以前はこの画面で保存していたため、プロフィール・SNS欄の変更が既存のセラピストに反映されていなかった）。
// 既存のセラピストは、エステ魂のID（external_cast_id）の編集画面を開き、名前が入っていることを確かめてから保存する。

export const ESTAMA_NEW_CAST_URL = "https://estama.jp/admin/cast_edit/";

/** 名前の比べ方（空白・記号・全角半角の違いは見ない） */
export const normalizeEstamaName = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase("ja-JP")
  .replace(/[\s\u3000・･·_＿―—–-]+/g, "")
  .replace(/[()（）[]【】「」『』]/g, "")
  .trim();

export function estamaNameMatches(value: string | null | undefined, names: Array<string | null | undefined>) {
  const actual = normalizeEstamaName(String(value || ""));
  if (!actual) return false;
  return names.some((name) => name && normalizeEstamaName(name) === actual);
}

const isEstamaId = (value: string | null | undefined): value is string => /^\d{3,}$/.test(String(value || ""));

/** エステ魂のURL（公開ページ・編集画面）からセラピストIDを取り出す */
export function estamaCastIdFromUrl(url: string | null | undefined) {
  const value = String(url || "");
  return value.match(/\/shop\/\d+\/cast\/(\d+)/)?.[1]
    || value.match(/\/cast_edit\/(\d+)/)?.[1]
    || value.match(/[?&](?:cast_id|cid|id)=(\d+)/)?.[1]
    || null;
}

/** 既存のセラピストの編集画面として試すURL（エステ魂の管理画面は /admin/<機能>/<ID>/ の形） */
export function estamaCastEditUrlCandidates(externalId: string | null | undefined, savedUrl?: string | null) {
  if (!isEstamaId(externalId)) return [];
  const urls = [
    savedUrl && estamaCastIdFromUrl(savedUrl) === externalId ? savedUrl : null,
    `https://estama.jp/admin/cast_edit/${externalId}/`,
    `https://estama.jp/admin/cast_edit/?cast_id=${externalId}`,
    `https://estama.jp/admin/cast_edit/?id=${externalId}`,
  ];
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

export interface PageLink {
  href: string;
  text: string;
  /** リンクを囲むカード（figure など）の文字と画像の alt。PC版の在籍一覧はリンクが「VIEW DETAIL」で、名前は隣の見出しにある */
  context?: string;
}

/** 管理画面のリンクのうち、そのセラピストの編集画面らしいもの */
export function estamaCastEditLinks(links: PageLink[], externalId: string) {
  return [...new Set(links
    .filter((link) => /^https:\/\/estama\.jp\/admin\//.test(link.href))
    .filter((link) => estamaCastIdFromUrl(link.href) === externalId || new RegExp(`/${externalId}(?:/|$|\\?)`).test(link.href))
    .filter((link) => /edit|profile|cast/i.test(link.href) || /編集|プロフィール/.test(link.text))
    .filter((link) => !/schedule|diary|photo_diary|delete|remove/i.test(link.href))
    .map((link) => link.href))];
}

/** 公開ページの在籍一覧から、同じ名前のセラピストのIDを探す（新規登録で同じ人を二重に作らないため） */
export function findEstamaCastIdByName(links: PageLink[], shopId: string, names: Array<string | null | undefined>) {
  const castLinks = links.flatMap((link) => {
    const id = link.href.match(new RegExp(`/shop/${shopId}/cast/(\\d+)/?(?:$|[?#])`))?.[1];
    return id ? [{ ...link, id }] : [];
  });
  // 一覧のリンクは「名前（年齢）」や「NEW 名前」のように飾りが付くことがあるので、語ごとにも比べる
  const matches = (value: string | undefined) => {
    const label = String(value || "").replace(/\s+/g, " ").trim();
    return [label, ...label.split(/[\s(（]/)].some((part) => estamaNameMatches(part, names));
  };
  const pick = (ids: string[]) => {
    const unique = [...new Set(ids)];
    // 同じ名前が2人いるときは決められないので、何もしない
    return unique.length === 1 ? unique[0] : null;
  };
  const byText = castLinks.filter((link) => matches(link.text)).map((link) => link.id);
  if (byText.length) return pick(byText);
  return pick(castLinks.filter((link) => matches(link.context)).map((link) => link.id));
}

/** 管理画面にあるセラピストへのリンク（同じ名前が二重に登録されていないかを後から確かめるため結果に残す） */
export function estamaAdminCastLinks(links: PageLink[]) {
  const seen = new Set<string>();
  const result: Array<{ id: string; text: string; href: string }> = [];
  for (const link of links) {
    if (!/^https:\/\/estama\.jp\/admin\//.test(link.href)) continue;
    const id = estamaCastIdFromUrl(link.href) || link.href.match(/\/admin\/[a-z_]+\/(\d{5,})\//)?.[1];
    if (!id) continue;
    const key = `${id}|${link.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, text: link.text.replace(/\s+/g, " ").trim().slice(0, 30), href: link.href });
  }
  return result.slice(0, 60);
}

export type EstamaSyncFields = "all" | "sns";

/** 同期する範囲。payload.fields = "sns" ならブログ・SNS欄だけ（写真・紹介文はエステ魂のまま） */
export function estamaSyncFields(payload: unknown): EstamaSyncFields {
  const fields = payload && typeof payload === "object" ? (payload as Record<string, unknown>).fields : null;
  return fields === "sns" ? "sns" : "all";
}
