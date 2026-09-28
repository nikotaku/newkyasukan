// Twilioの認証情報。Edge FunctionのSecrets（TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN）を優先し、
// 無ければVaultの twilio_account_sid / twilio_auth_token を RPC get_twilio_credentials()（service_roleのみ）で読む。
// 認証情報をコードに直接書かないこと（リポジトリは公開）。

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

interface RpcClient {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
}

export async function loadTwilioCredentials(client: RpcClient): Promise<TwilioCredentials | null> {
  const envSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const envToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (envSid && envToken) return { accountSid: envSid, authToken: envToken };

  const { data, error } = await client.rpc("get_twilio_credentials");
  if (error) {
    console.error("Twilio credentials lookup failed", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { account_sid?: string | null; auth_token?: string | null } | null;
  if (!row?.account_sid || !row.auth_token) return null;
  return { accountSid: row.account_sid, authToken: row.auth_token };
}

export function twilioAuthHeader(credentials: TwilioCredentials) {
  return `Basic ${btoa(`${credentials.accountSid}:${credentials.authToken}`)}`;
}
