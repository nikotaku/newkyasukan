// Twilio（SMS）の残高と今月の使用額。
//  - { action: "summary" }     … 管理画面（店舗のオーナー・マネージャー）向け。残高・未精算の送信分・今月の使用額を返す
//  - { action: "check-alert" } … pg_cron（x-sms-billing-cron-secret）から1時間ごと。実質残高が閾値を切ったらLINEで知らせる
//
// 通知はメインアカウントの operations グループへ送り、送れなければ予約通知専用アカウントの web_booking グループへ回す
// （専用アカウントはWEB予約通知の予備分を残す）。直近でSMSを送った店舗が対象。

import { loadLineBookingChannel } from "../_shared/lineBookingChannel.ts";
import { pushLineText, readLineQuota } from "../_shared/linePush.ts";
import { loadTwilioCredentials, twilioAuthHeader, type TwilioCredentials } from "../_shared/twilio.ts";
import { canSendSmsReplyNotice } from "../sms-webhook/smsLineNotification.ts";
import {
  buildBalanceAlertMessage,
  jstMonthStart,
  shouldSendBalanceAlert,
  summarizeTwilioBilling,
  type BillingSummary,
  type TwilioMessage,
  type TwilioUsageRecord,
} from "./billing.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, Prefer: "return=representation", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const rpcClient = {
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    try {
      return { data: await sb(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }), error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
};

async function twilio(credentials: TwilioCredentials, url: string) {
  const r = await fetch(url, { headers: { Authorization: twilioAuthHeader(credentials) }, signal: AbortSignal.timeout(15_000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`twilio ${r.status}: ${body?.message ?? ""}`);
  return body;
}

// 日本宛てSMSの1通分の料金（携帯宛ての最高値）
async function japanSmsUnitPrice(credentials: TwilioCredentials) {
  try {
    const pricing = await twilio(credentials, "https://pricing.twilio.com/v1/Messaging/Countries/JP");
    const prices = (pricing.outbound_sms_prices || []).flatMap((carrier: { prices?: Array<{ current_price?: string }> }) =>
      (carrier.prices || []).map((p) => Number(p.current_price))
    ).filter((n: number) => Number.isFinite(n) && n > 0);
    return prices.length ? Math.max(...prices) : null;
  } catch {
    return null;
  }
}

async function fetchSummary(credentials: TwilioCredentials, now: Date): Promise<BillingSummary> {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}`;
  // Twilioの DateSent は日付（UTC）単位なので、日本時間の月初を含む日から取って手元で絞る
  const since = jstMonthStart(now).toISOString().slice(0, 10);
  const [balance, usage, unitPrice] = await Promise.all([
    twilio(credentials, `${base}/Balance.json`),
    twilio(credentials, `${base}/Usage/Records/ThisMonth.json?PageSize=500`),
    japanSmsUnitPrice(credentials),
  ]);
  const messages: TwilioMessage[] = [];
  let next: string | null = `${base}/Messages.json?PageSize=1000&DateSent%3E=${since}`;
  for (let page = 0; next && page < 10; page += 1) {
    const body = await twilio(credentials, next);
    messages.push(...(body.messages || []));
    next = body.next_page_uri ? `https://api.twilio.com${body.next_page_uri}` : null;
  }
  return summarizeTwilioBilling({
    balance: Number(balance.balance),
    currency: String(balance.currency || "JPY"),
    usageRecords: (usage.usage_records || []) as TwilioUsageRecord[],
    messages,
    unitPrice,
    now,
  });
}

// 店舗のオーナー・マネージャーだけが見られる（管理権限は user_stores の role。user_roles テーブルはない）
async function isStoreManager(authorization: string) {
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!jwt) return false;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return false;
  const user = await r.json();
  if (!user?.id) return false;
  const stores = await sb(`user_stores?user_id=eq.${user.id}&role=in.(owner,manager)&select=role&limit=1`);
  return Boolean(stores?.length);
}

async function isCron(req: Request) {
  const secret = req.headers.get("x-sms-billing-cron-secret");
  if (!secret) return false;
  const { data, error } = await rpcClient.rpc("verify_sms_billing_cron_secret", { candidate: secret });
  return !error && data === true;
}

async function sendBalanceAlert(summary: BillingSummary, alertId: string) {
  // 直近60日にSMSを送った店舗へ知らせる
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const recent = await sb(`sms_logs?direction=eq.outbound&created_at=gte.${since}&store_id=not.is.null&select=store_id&limit=1000`);
  const storeIds = [...new Set((recent || []).map((row: { store_id: string }) => row.store_id))];
  if (!storeIds.length) return null;
  const destinations = await sb(
    `line_notification_destinations?store_id=in.(${storeIds.join(",")})&destination_key=in.(operations,web_booking)&select=store_id,destination_key,line_group_id`,
  ) as Array<{ store_id: string; destination_key: string; line_group_id: string }>;
  const message = buildBalanceAlertMessage(summary);
  const mainToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  let channel: string | null = null;

  for (const storeId of storeIds) {
    const group = (key: string) => destinations.find((d) => d.store_id === storeId && d.destination_key === key)?.line_group_id;
    const operations = group("operations") || (storeIds.length === 1 ? Deno.env.get("LINE_GROUP_ID") : null);
    if (mainToken && operations) {
      const result = await pushLineText(mainToken, operations, message, crypto.randomUUID());
      if (result.ok) { channel = "main"; continue; }
      console.warn("SMS balance alert failed", { account: "main", status: result.status });
    }
    const booking = group("web_booking");
    if (!booking) continue;
    const { token } = await loadLineBookingChannel(rpcClient);
    if (!token) continue;
    if (!canSendSmsReplyNotice(await readLineQuota(token, booking))) {
      console.warn("SMS balance alert skipped to keep web booking quota");
      continue;
    }
    const result = await pushLineText(token, booking, message, crypto.randomUUID());
    if (result.ok) channel = channel || "booking";
    else console.warn("SMS balance alert failed", { account: "booking", status: result.status });
  }
  console.log(JSON.stringify({ event: "sms_balance_alert", alertId, channel, effectiveBalance: Math.round(summary.effectiveBalance) }));
  return channel;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json().catch(() => ({})) as { action?: string };
    const cron = await isCron(req);
    if (!cron && !(await isStoreManager(req.headers.get("Authorization") || ""))) {
      return json({ error: "権限がありません" }, 403);
    }
    const credentials = await loadTwilioCredentials(rpcClient);
    if (!credentials) return json({ error: "Twilioの認証情報が設定されていません" }, 500);
    const now = new Date();
    const summary = await fetchSummary(credentials, now);

    if (input.action === "check-alert") {
      if (!cron) return json({ error: "権限がありません" }, 403);
      const [lastAlert] = await sb("sms_balance_alerts?select=created_at,delivered&order=created_at.desc&limit=1");
      if (!shouldSendBalanceAlert(summary, lastAlert || null, now)) return json({ ...summary, alerted: false });
      const alertId = crypto.randomUUID();
      const channel = await sendBalanceAlert(summary, alertId);
      await sb("sms_balance_alerts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: alertId,
          balance: summary.balance,
          effective_balance: summary.effectiveBalance,
          currency: summary.currency,
          delivered: Boolean(channel),
          channel,
        }),
      });
      return json({ ...summary, alerted: Boolean(channel) });
    }
    return json(summary);
  } catch (error) {
    console.error("sms-billing error:", error);
    return json({ error: "Twilioの残高を取得できませんでした" }, 500);
  }
});
