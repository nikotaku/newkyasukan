// Web Push（ホーム画面に追加した管理画面への通知）の送信。外部ライブラリを使わず WebCrypto だけで、
// VAPID（RFC 8292）の署名と、本文の暗号化 aes128gcm（RFC 8291 / 8188）を行う。
// Deno（Edge Function）でも Node（テスト）でも動くよう、Deno 固有のAPIは使わない。

export interface PushTarget {
  endpoint: string;
  p256dh: string; // ブラウザの公開鍵（base64url、65バイト）
  auth: string; // 認証用の乱数（base64url、16バイト）
}

export interface VapidKeys {
  publicKey: string; // base64url（65バイトの非圧縮点）。ブラウザの applicationServerKey と同じもの
  privateKeyJwk: JsonWebKey; // ECDSA P-256 の秘密鍵（Vault に保存）
  subject: string; // https://… または mailto:…
}

export interface PushResult {
  ok: boolean;
  status: number;
  // 購読が切れている（アプリ削除・許可取り消し）。この購読は消してよい
  gone: boolean;
  error?: string;
}

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

// HKDF（出力32バイト以下なので1ブロックで足りる）
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

export interface EncryptOptions {
  // テスト用（通常は毎回ランダム）
  salt?: Uint8Array;
  senderKeyPair?: CryptoKeyPair;
}

/** RFC 8291：ブラウザの公開鍵と auth で本文を暗号化し、aes128gcm の本文（ヘッダー込み）を返す */
export async function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, payload: Uint8Array, options: EncryptOptions = {}) {
  const uaPublic = base64UrlDecode(target.p256dh);
  const authSecret = base64UrlDecode(target.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("購読の鍵が正しくありません");

  const senderKeys = options.senderKeyPair
    ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, senderKeys.privateKey, 256));

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // 1レコードだけ送る。最後のレコードの区切りは 0x02
  const plaintext = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** RFC 8292：プッシュサービス（endpoint の送り先）向けの VAPID 署名つき Authorization ヘッダー */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  })));
  const signingKey = await crypto.subtle.importKey("jwk", vapid.privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto の ECDSA 署名は r||s（64バイト）で、JWS の ES256 と同じ形
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`;
}

export async function sendWebPush(
  target: PushTarget,
  message: unknown,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string; timeoutMs?: number } = {},
): Promise<PushResult> {
  try {
    const body = await encryptPayload(target, encoder.encode(JSON.stringify(message)));
    const headers: Record<string, string> = {
      Authorization: await vapidAuthorization(target.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttlSeconds ?? 24 * 60 * 60),
      Urgency: options.urgency ?? "high",
    };
    // Topic は同じものを後から送ると置き換わる（base64url 32文字まで）
    if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    const text = response.ok ? "" : (await response.text().catch(() => "")).slice(0, 300);
    return {
      ok: response.ok,
      status: response.status,
      gone: response.status === 404 || response.status === 410,
      error: response.ok ? undefined : text || `push ${response.status}`,
    };
  } catch (error) {
    return { ok: false, status: 0, gone: false, error: error instanceof Error ? error.message : String(error) };
  }
}
