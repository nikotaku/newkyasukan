// メンエスなう（men-esthe.co.jp）の店舗管理画面を調べる処理のうち、画面に依存しない部分（テスト tests/menesnowInspect.test.ts）

export const MENESNOW_ORIGIN = "https://men-esthe.co.jp";
export const MENESNOW_DOMAINS = ["men-esthe.co.jp", "www.men-esthe.co.jp"];

type ChannelLike = { id: string; platform: string; label: string; login_url: string | null; handle: string | null; password_configured: boolean };

/** 店舗の投稿先（その他の媒体）から、メンエスなうのものを探す */
export function findMenesnowChannel<T extends ChannelLike>(channels: T[]) {
  const isMenesnow = (c: T) => c.platform === "other"
    && (/men-esthe\.co\.jp/i.test(`${c.login_url ?? ""} ${c.handle ?? ""}`) || /メンエスなう|メンスナウ|menesnow/i.test(c.label));
  return channels.find((c) => isMenesnow(c) && c.password_configured) ?? channels.find(isMenesnow) ?? null;
}

/** 登録されたURLから店舗管理画面の店舗IDを取る（/manage/store/6490/...） */
export function menesnowStoreId(...urls: Array<string | null | undefined>) {
  for (const url of urls) {
    const match = url?.match(/\/manage\/store\/(\d+)/);
    if (match) return match[1];
  }
  return null;
}

/** ログイン後に開く画面。店舗IDが分かればその店舗の管理画面 */
export function menesnowLoginUrl(storeId: string | null) {
  const next = storeId ? `/manage/store/${storeId}/` : "/manage/";
  return `${MENESNOW_ORIGIN}/accounts/login/?next=${encodeURIComponent(next)}`;
}

/** ログインを押したあとの画面から、結果を判断する */
export function classifyMenesnowLogin(input: { url: string; hasPasswordField: boolean; errorText: string; blocked: boolean }) {
  if (input.blocked) return { ok: false as const, error: "メンエスなうに接続できませんでした（日本のIPからの接続・Cloudflareの確認で止まりました）" };
  const path = (() => { try { return new URL(input.url).pathname; } catch { return input.url; } })();
  if (!/^\/accounts\/login/.test(path) && !input.hasPasswordField) return { ok: true as const };
  const errorText = input.errorText.replace(/\s+/g, " ").trim();
  if (errorText) return { ok: false as const, error: `メンエスなうがログインを受け付けませんでした：${errorText.slice(0, 200)}` };
  return { ok: false as const, error: "ログイン後に管理画面へ移れませんでした（ID・パスワードを確認してください）" };
}

/** 画面から集めたリンクを、同じサイトの管理画面のものだけ・重複なしにする */
export function normalizeMenesnowLinks(links: Array<{ text: string; href: string }>) {
  const seen = new Set<string>();
  const result: Array<{ text: string; path: string }> = [];
  for (const link of links) {
    let url: URL;
    try { url = new URL(link.href, MENESNOW_ORIGIN); } catch { continue; }
    if (!MENESNOW_DOMAINS.includes(url.hostname)) continue;
    if (/logout/i.test(url.pathname)) continue;
    const path = `${url.pathname}${url.search}`;
    if (seen.has(path)) continue;
    seen.add(path);
    result.push({ text: link.text.replace(/\s+/g, " ").trim().slice(0, 60), path });
  }
  return result.slice(0, 150);
}

/** 結果（JSON）にログイン情報が混ざっていたら伏せる */
export function scrubJson(json: string, secrets: Array<string | null | undefined>) {
  let result = json;
  for (const secret of secrets) {
    if (!secret || secret.length < 3) continue;
    const escaped = JSON.stringify(secret).slice(1, -1);
    result = result.split(escaped).join("***");
  }
  return result;
}
