// お客様用LINE公式アカウントの Messaging API 呼び出し。
// 長期トークンは発行し直さない（LINE公式アカウントの管理画面・ほかのツールに影響しないよう）。
// Channel ID / secret から15分有効のステートレストークンをその都度発行する。

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

export async function issueLineToken(channelId: string, channelSecret: string) {
  const cached = tokenCache.get(channelId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const response = await fetch("https://api.line.me/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: channelId, client_secret: channelSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`LINEのトークンを発行できません（${response.status}）。Channel ID・Channel secret を確かめてください`);
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("LINEのトークンを発行できません");
  tokenCache.set(channelId, { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 900) * 1000 });
  return body.access_token;
}

export async function getLineProfile(token: string, userId: string) {
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    return await r.json() as { displayName?: string; pictureUrl?: string };
  } catch {
    return null;
  }
}

export async function getLineBotInfo(token: string) {
  const r = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`LINEに接続できません（${r.status}）`);
  return await r.json() as { basicId?: string; displayName?: string; chatMode?: string; markAsReadMode?: string };
}

export async function getLineWebhookEndpoint(token: string) {
  try {
    const r = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    return await r.json() as { endpoint?: string; active?: boolean };
  } catch {
    return null;
  }
}

// retryKey はUUID。同じキーの再送はLINE側で1回に畳まれる
export async function pushLineMessage(token: string, to: string, text: string, retryKey: string) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Line-Retry-Key": retryKey },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.ok || (r.status === 409 && r.headers.get("x-line-accepted-request-id"))) return { ok: true as const };
  const detail = await r.text().catch(() => "");
  const reason = r.status === 429
    ? "LINEの今月の送信数の上限に達しています（LINE公式アカウントのプランを確認してください）"
    : r.status === 403 || r.status === 400
      ? "このお客様に送れません（ブロックされている・友だちでない など）"
      : `LINEに送れませんでした（${r.status}）`;
  return { ok: false as const, error: `${reason}${detail ? ` ${detail.slice(0, 200)}` : ""}` };
}
