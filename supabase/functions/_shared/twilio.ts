// Twilioの認証情報。Edge FunctionのSecrets（TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID /
// TWILIO_API_KEY_SECRET）を優先し、無ければVaultの同名小文字キーを
// RPC get_twilio_credentials()（service_roleのみ）で読む。
// 認証情報をコードに直接書かないこと（リポジトリは公開）。

export interface TwilioCredentials {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
}

interface RpcClient {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
}

export async function loadTwilioCredentials(client: RpcClient): Promise<TwilioCredentials | null> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID");
  const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET");
  if (accountSid && apiKeySid && apiKeySecret) return { accountSid, apiKeySid, apiKeySecret };

  const { data, error } = await client.rpc("get_twilio_credentials");
  if (error) {
    console.error("Twilio credentials lookup failed", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    account_sid?: string | null;
    api_key_sid?: string | null;
    api_key_secret?: string | null;
  } | null;
  if (!row?.account_sid || !row.api_key_sid || !row.api_key_secret) return null;
  return { accountSid: row.account_sid, apiKeySid: row.api_key_sid, apiKeySecret: row.api_key_secret };
}

export function twilioAuthHeader(credentials: TwilioCredentials) {
  return `Basic ${btoa(`${credentials.apiKeySid}:${credentials.apiKeySecret}`)}`;
}
