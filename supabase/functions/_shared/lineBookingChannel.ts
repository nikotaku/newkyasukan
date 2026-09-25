// 予約通知専用LINE公式アカウントの認証情報。
// Edge FunctionのSecrets（LINE_BOOKING_*）を優先し、無ければVaultのChannel ID / Channel secretから
// 15分有効のステートレストークンを発行する。長期トークンを発行し直さないので、
// 同じチャネルを長期トークンで使っている別のボットには影響しない。

export interface LineBookingCredentialSource {
  envToken?: string | null;
  envSecret?: string | null;
  envChannelId?: string | null;
  storedChannelId?: string | null;
  storedSecret?: string | null;
}

export interface LineBookingCredentialPlan {
  staticToken: string | null;
  channelId: string | null;
  channelSecret: string | null;
}

export interface LineBookingChannel {
  token: string | null;
  channelSecret: string | null;
}

interface RpcClient {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
}

export function planLineBookingCredentials(source: LineBookingCredentialSource): LineBookingCredentialPlan {
  return {
    staticToken: source.envToken || null,
    channelId: source.envChannelId || source.storedChannelId || null,
    channelSecret: source.envSecret || source.storedSecret || null,
  };
}

let cachedToken: { channelId: string; value: string; expiresAt: number } | null = null;

async function issueStatelessToken(channelId: string, channelSecret: string) {
  if (cachedToken?.channelId === channelId && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch("https://api.line.me/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  if (!response.ok) {
    console.error("LINE booking token issue failed", { status: response.status });
    return null;
  }
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  cachedToken = {
    channelId,
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
  };
  return body.access_token;
}

// 失敗しても例外を投げない（予約通知のメール退避やメインアカウントへの切り替えを止めないため）。
export async function loadLineBookingChannel(sb: RpcClient): Promise<LineBookingChannel> {
  try {
    const envToken = Deno.env.get("LINE_BOOKING_CHANNEL_ACCESS_TOKEN");
    const envSecret = Deno.env.get("LINE_BOOKING_CHANNEL_SECRET");
    const envChannelId = Deno.env.get("LINE_BOOKING_CHANNEL_ID");

    let stored: { channel_id?: string | null; channel_secret?: string | null } = {};
    if (!envSecret || (!envToken && !envChannelId)) {
      const { data, error } = await sb.rpc("get_line_booking_channel");
      if (error) console.error("LINE booking channel lookup failed");
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row === "object") stored = row as typeof stored;
    }

    const plan = planLineBookingCredentials({
      envToken,
      envSecret,
      envChannelId,
      storedChannelId: stored.channel_id,
      storedSecret: stored.channel_secret,
    });
    if (plan.staticToken) return { token: plan.staticToken, channelSecret: plan.channelSecret };
    if (!plan.channelId || !plan.channelSecret) return { token: null, channelSecret: plan.channelSecret };
    return {
      token: await issueStatelessToken(plan.channelId, plan.channelSecret),
      channelSecret: plan.channelSecret,
    };
  } catch {
    console.error("LINE booking channel could not be loaded");
    return { token: null, channelSecret: null };
  }
}
