// 管理画面を「ホーム画面に追加」したアプリへのプッシュ通知（LINE通知と並行して送る試験運用）。
//  - { event: "web_booking" | "sms_reply" | "sms_balance" | "estama_scout" | "estama_login" | "daily_sales" | "settlement_transfer", id, resubmitted? } … DBトリガーから（x-push-notify-secret）
//  - { action: "test" } … ログイン中のスタッフが自分の端末にテスト通知を送る（JWT）
// 購読（push_subscriptions）の topics に含まれる通知だけを、その店舗の端末へ送る。SMS残高は全店舗の購読へ。
// 送れなくなった購読（アプリ削除・通知オフ）は消す。VAPIDの鍵は Vault（RPC get_web_push_vapid）。

import { sendWebPush, type VapidKeys } from "../_shared/webPush.ts";
import {
  dailySalesMessage,
  estamaLoginMessage,
  estamaScoutMessage,
  settlementTransferMessage,
  smsBalanceMessage,
  smsReplyMessage,
  testMessage,
  webBookingMessage,
  type PushMessage,
} from "./messages.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = "https://enka-salon.jp";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sb(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`supabase ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const rpc = (fn: string, args: Record<string, unknown> = {}) => sb(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

let vapidCache: VapidKeys | null = null;
async function vapid() {
  if (vapidCache) return vapidCache;
  const rows = await rpc("get_web_push_vapid");
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.public_key || !row?.private_jwk) throw new Error("Web Pushの鍵が設定されていません");
  vapidCache = { publicKey: row.public_key, privateKeyJwk: JSON.parse(row.private_jwk), subject: VAPID_SUBJECT };
  return vapidCache;
}

async function deliver(subscriptions: Subscription[], message: PushMessage) {
  const keys = await vapid();
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    const result = await sendWebPush(subscription, message, keys, { topic: message.tag });
    const now = new Date().toISOString();
    if (result.gone) {
      await sb(`push_subscriptions?id=eq.${subscription.id}`, { method: "DELETE" }).catch(() => null);
    } else {
      await sb(`push_subscriptions?id=eq.${subscription.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(result.ok
          ? { last_success_at: now, last_error: null, failure_count: 0 }
          : { last_error: result.error ?? `push ${result.status}`, failure_count: subscription.failure_count + 1 }),
      }).catch(() => null);
    }
    return result;
  }));
  const sent = results.filter((r) => r.ok).length;
  console.log(JSON.stringify({ event: "web_push", tag: message.tag, targets: subscriptions.length, sent, gone: results.filter((r) => r.gone).length }));
  return { targets: subscriptions.length, sent };
}

const subscriptionColumns = "id,endpoint,p256dh,auth,failure_count";

async function subscribersFor(topic: string, storeId: string | null): Promise<Subscription[]> {
  const store = storeId ? `&store_id=eq.${storeId}` : "";
  return (await sb(`push_subscriptions?topics=cs.{${topic}}${store}&select=${subscriptionColumns}`)) ?? [];
}

// topic を省くと event と同じ名前の通知の種類へ送る
async function buildEvent(event: string, id: string, resubmitted = false): Promise<{ message: PushMessage; storeId: string | null; topic?: string } | null> {
  if (event === "web_booking") {
    const [reservation] = await sb(
      `reservations?id=eq.${id}&select=id,store_id,booking_origin,reservation_date,start_time,duration,course_name,customer_name,price,nomination_type,cast_id`,
    );
    if (!reservation) return null;
    const [cast] = reservation.cast_id ? await sb(`casts?id=eq.${reservation.cast_id}&select=name`) : [null];
    return { message: webBookingMessage(reservation, cast?.name ?? null), storeId: reservation.store_id };
  }
  if (event === "sms_reply") {
    const [log] = await sb(`sms_logs?id=eq.${id}&select=id,store_id,from_number,body,customer_id,direction`);
    if (!log || log.direction !== "inbound" || !log.from_number) return null;
    // LINE通知と同じく、こちらから送ったことのある番号の返信だけ知らせる（迷惑SMS対策）
    const [sent] = await sb(`sms_logs?direction=eq.outbound&to_number=eq.${encodeURIComponent(log.from_number)}&select=id&limit=1`);
    if (!sent) return null;
    const [customer] = log.customer_id ? await sb(`customers?id=eq.${log.customer_id}&select=name`) : [null];
    return { message: smsReplyMessage({ fromNumber: log.from_number, body: log.body ?? "", customerName: customer?.name ?? null }), storeId: log.store_id };
  }
  if (event === "estama_scout") {
    const [batch] = await sb(
      `estama_scout_batches?id=eq.${id}&select=id,store_id,status,scout_date,candidate_count,sent_count,failed_count,error_message`,
    );
    if (!batch || !["pending_approval", "done", "failed"].includes(batch.status)) return null;
    const candidates = (await sb(
      `estama_scout_candidates?batch_id=eq.${id}&select=display_name&order=position.asc&limit=5`,
    )) ?? [];
    const names = candidates.map((candidate: { display_name: string | null }) => candidate.display_name ?? "");
    return { message: estamaScoutMessage(batch, names), storeId: batch.store_id };
  }
  if (event === "estama_login") {
    const [alert] = await sb(`estama_login_alerts?id=eq.${id}&select=id,store_id,kind,message`);
    if (!alert) return null;
    return { message: estamaLoginMessage(alert), storeId: alert.store_id };
  }
  if (event === "daily_sales") {
    const [record] = await sb(
      `daily_sales_records?id=eq.${id}&select=id,store_id,cast_id,date,status,total_amount,cash_amount,card_amount,paypay_amount,customer_count,manual_adjustment,notes`,
    );
    if (!record || record.status !== "pending") return null;
    const [cast] = record.cast_id ? await sb(`casts?id=eq.${record.cast_id}&select=name`) : [null];
    return { message: dailySalesMessage(record, cast?.name ?? null, resubmitted), storeId: record.store_id };
  }
  if (event === "settlement_transfer") {
    const [approval] = await sb(
      `settlement_approvals?clearance_id=eq.${id}&select=clearance_id,store_id,cast_id,date,shortage_amount,shortage_method,shortage_settled_at`,
    );
    if (!approval || approval.shortage_method !== "transfer" || approval.shortage_settled_at) return null;
    const [[cast], [account]] = await Promise.all([
      sb(`casts?id=eq.${approval.cast_id}&select=name`),
      sb(`cast_bank_accounts?cast_id=eq.${approval.cast_id}&select=bank_name,branch_name,account_type,account_number,account_holder`),
    ]);
    // 振込先がそろってから1回だけ知らせる（振込先の保存でもう一度呼ばれる）
    if (!account) return null;
    // 精算の通知（daily_sales）を受け取っている端末へ
    return { message: settlementTransferMessage(approval, cast?.name ?? null, account), storeId: approval.store_id, topic: "daily_sales" };
  }
  if (event === "sms_balance") {
    const [alert] = await sb(`sms_balance_alerts?id=eq.${id}&select=effective_balance`);
    if (!alert) return null;
    return { message: smsBalanceMessage(Number(alert.effective_balance)), storeId: null };
  }
  return null;
}

async function signedInUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!jwt) return null;
  const response = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${jwt}` } });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? (user.id as string) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json().catch(() => ({})) as { event?: string; id?: string; action?: string; resubmitted?: boolean };

    if (input.action === "test") {
      const userId = await signedInUser(req);
      if (!userId) return json({ error: "ログインしてください" }, 401);
      const subscriptions = (await sb(`push_subscriptions?user_id=eq.${userId}&select=${subscriptionColumns}`)) ?? [];
      if (!subscriptions.length) return json({ error: "この端末はまだ通知を受け取る設定になっていません" }, 400);
      return json(await deliver(subscriptions, testMessage()));
    }

    const secret = req.headers.get("x-push-notify-secret");
    const verified = secret ? await rpc("verify_push_notify_secret", { candidate: secret }) : false;
    if (verified !== true) return json({ error: "権限がありません" }, 403);
    if (!input.event || !input.id || !/^[0-9a-f-]{36}$/i.test(input.id)) return json({ error: "event と id が必要です" }, 400);

    const built = await buildEvent(input.event, input.id, input.resubmitted === true);
    if (!built) return json({ skipped: true });
    const subscriptions = await subscribersFor(built.topic ?? input.event, built.storeId);
    if (!subscriptions.length) return json({ targets: 0, sent: 0 });
    return json(await deliver(subscriptions, built.message));
  } catch (error) {
    console.error("push-notify error:", error);
    return json({ error: "通知を送れませんでした" }, 500);
  }
});
