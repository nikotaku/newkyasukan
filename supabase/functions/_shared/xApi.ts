// X（旧Twitter）API への投稿。店舗が自分のアカウントで作ったアプリのキー（OAuth 1.0a の4つ）で署名する。
// 外部ライブラリを使わず WebCrypto だけで署名するので、Deno（Edge Function）でも Node（テスト）でも動く。

export interface XCredentials {
  apiKey: string; // Consumer Key
  apiSecret: string; // Consumer Secret
  accessToken: string;
  accessTokenSecret: string;
}

export interface XApiResult {
  ok: boolean;
  status: number;
  id?: string;
  username?: string;
  error?: string;
  // キーが無効・権限不足など、人が直すまで続けても失敗する
  needsAttention?: boolean;
}

const encoder = new TextEncoder();

/** RFC 3986 のパーセントエンコード（OAuth 1.0a の決まり） */
export function percentEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface OAuthRequest {
  method: string;
  url: string; // クエリ付きでもよい
  credentials: XCredentials;
  // フォーム送信のときの本文パラメータ（JSON 本文は署名に含めない）
  bodyParams?: Record<string, string>;
  nonce?: string;
  timestamp?: number;
}

export async function oauthSignature(request: OAuthRequest) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  const oauth: Record<string, string> = {
    oauth_consumer_key: request.credentials.apiKey,
    oauth_nonce: request.nonce ?? crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(request.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: request.credentials.accessToken,
    oauth_version: "1.0",
  };
  const params: Array<[string, string]> = [
    ...Object.entries(oauth),
    ...Array.from(url.searchParams.entries()),
    ...Object.entries(request.bodyParams ?? {}),
  ].map(([k, v]) => [percentEncode(k), percentEncode(v)] as [string, string]);
  params.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  const paramString = params.map(([k, v]) => `${k}=${v}`).join("&");
  const baseString = [request.method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(request.credentials.apiSecret)}&${percentEncode(request.credentials.accessTokenSecret)}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = base64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(baseString))));
  return { oauth, signature, baseString };
}

export async function oauthHeader(request: OAuthRequest) {
  const { oauth, signature } = await oauthSignature(request);
  const fields = { ...oauth, oauth_signature: signature };
  return "OAuth " + Object.entries(fields)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");
}

const API = "https://api.x.com/2";

function describeError(status: number, body: Record<string, unknown> | null) {
  const detail = typeof body?.detail === "string" ? body.detail : "";
  const title = typeof body?.title === "string" ? body.title : "";
  const errors = Array.isArray(body?.errors) ? (body!.errors as Array<{ message?: string }>).map((e) => e.message).filter(Boolean).join(" / ") : "";
  const raw = [title, detail, errors].filter(Boolean).join(": ") || `HTTP ${status}`;
  if (status === 401) return { error: `キーが無効です（${raw}）。キーを確認して登録し直してください`, needsAttention: true };
  if (status === 403 && /duplicate/i.test(raw)) return { error: `同じ文章は続けて投稿できません（${raw}）`, needsAttention: false };
  if (status === 403) return { error: `投稿が許可されていません（${raw}）。アプリの権限が「Read and write」か、キーを作り直したかを確認してください`, needsAttention: true };
  if (status === 402) return { error: `X APIの利用枠・料金プランの問題で投稿できません（${raw}）`, needsAttention: true };
  if (status === 429) return { error: `投稿の上限に達しました。しばらく待ってから再開してください（${raw}）`, needsAttention: true };
  return { error: raw, needsAttention: false };
}

async function call(method: "GET" | "POST", path: string, credentials: XCredentials, json?: unknown, fetchImpl: typeof fetch = fetch): Promise<XApiResult & { body: Record<string, unknown> | null }> {
  const url = `${API}${path}`;
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: await oauthHeader({ method, url, credentials }),
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok) return { ok: true, status: response.status, body };
    return { ok: false, status: response.status, body, ...describeError(response.status, body) };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: `X に接続できませんでした（${error instanceof Error ? error.message : String(error)}）` };
  }
}

/** 投稿する。成功すると投稿の ID を返す */
export async function postTweet(credentials: XCredentials, text: string, fetchImpl?: typeof fetch): Promise<XApiResult> {
  const result = await call("POST", "/tweets", credentials, { text }, fetchImpl);
  const data = result.body?.data as { id?: string } | undefined;
  return { ok: result.ok && !!data?.id, status: result.status, id: data?.id, error: result.error ?? (result.ok && !data?.id ? "投稿IDが返ってきませんでした" : undefined), needsAttention: result.needsAttention };
}

/** キーが正しいか（どのアカウントのキーか）を確かめる */
export async function verifyCredentials(credentials: XCredentials, fetchImpl?: typeof fetch): Promise<XApiResult> {
  const result = await call("GET", "/users/me", credentials, undefined, fetchImpl);
  const data = result.body?.data as { username?: string } | undefined;
  return { ok: result.ok && !!data?.username, status: result.status, username: data?.username, error: result.error, needsAttention: result.needsAttention };
}

export const tweetUrl = (username: string | null | undefined, id: string) =>
  `https://x.com/${username ? username.replace(/^@/, "") : "i"}/status/${id}`;
