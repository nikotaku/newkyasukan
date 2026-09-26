// Twilio SMS Webhook
//  - 送信ステータス通知（StatusCallback）: MessageSid + MessageStatus → sms_logs を更新
//  - 受信（お客様からの返信）: From + Body → sms_logs に direction=inbound で記録（未読）し、LINEにも知らせる
//
// LINE通知は予約通知専用アカウント（web_booking のグループ）を優先し、送れなければメインアカウント
// （operations のグループ）に切り替える。専用アカウントはWEB予約通知の予備分を残して送る。
// こちらから送ったことのある番号からの返信だけを通知する（店舗を特定でき、無関係な送信で通数を使わない）。

import { loadLineBookingChannel } from "../_shared/lineBookingChannel.ts";
import {
  buildSmsReplyLineMessage,
  canSendSmsReplyNotice,
  smsThreadUrl,
  type QuotaSnapshot,
  type SmsReplyReservation,
} from "./smsLineNotification.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, Prefer: "return=representation", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

const rpcClient = {
  rpc: async (fn: string) => {
    try {
      return { data: await sb(`rpc/${fn}`, { method: "POST", body: "{}" }), error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
};

const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "Content-Type": "text/xml" } });

async function lineGet(token: string, path: string) {
  const r = await fetch(`https://api.line.me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`line ${r.status}`);
  return await r.json();
}

async function readQuota(token: string, groupId: string): Promise<QuotaSnapshot | null> {
  try {
    const [quota, consumption, members] = await Promise.all([
      lineGet(token, "/v2/bot/message/quota"),
      lineGet(token, "/v2/bot/message/quota/consumption"),
      lineGet(token, `/v2/bot/group/${encodeURIComponent(groupId)}/members/count`),
    ]);
    return {
      limit: quota?.type === "limited" ? Number(quota.value) : null,
      used: Number(consumption?.totalUsage ?? 0),
      members: Number(members?.count ?? 1),
    };
  } catch {
    return null;
  }
}

async function pushLine(token: string, groupId: string, text: string, retryKey: string) {
  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const accepted = r.status === 409 && Boolean(r.headers.get("x-line-accepted-request-id"));
    return { ok: r.ok || accepted, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function notifySmsReplyToLine(input: {
  logId: string;
  storeId: string;
  fromNumber: string;
  body: string;
  customerId: string | null;
  reservationId: string | null;
}) {
  const [destinations, stores, customers, reservations] = await Promise.all([
    sb(`line_notification_destinations?store_id=eq.${input.storeId}&destination_key=in.(web_booking,operations)&select=destination_key,line_group_id`),
    sb(`stores?id=eq.${input.storeId}&select=name,custom_domain`),
    input.customerId ? sb(`customers?id=eq.${input.customerId}&select=name`) : Promise.resolve([]),
    input.reservationId
      ? sb(`reservations?id=eq.${input.reservationId}&select=customer_name,reservation_date,start_time,cast_id`)
      : Promise.resolve([]),
  ]);
  const groups = new Map<string, string>(
    (destinations || []).map((row: { destination_key: string; line_group_id: string }) => [row.destination_key, row.line_group_id]),
  );
  const store = stores?.[0] || null;
  const reservationRow = reservations?.[0] || null;
  let reservation: SmsReplyReservation | null = null;
  if (reservationRow) {
    const [cast] = reservationRow.cast_id ? await sb(`casts?id=eq.${reservationRow.cast_id}&select=name`) : [null];
    reservation = { date: reservationRow.reservation_date, time: reservationRow.start_time, castName: cast?.name || null };
  }
  const message = buildSmsReplyLineMessage({
    storeName: store?.name || null,
    customerName: customers?.[0]?.name || reservationRow?.customer_name || null,
    phone: input.fromNumber,
    body: input.body,
    reservation,
    threadUrl: smsThreadUrl(store?.custom_domain, input.fromNumber),
  });

  const bookingGroup = groups.get("web_booking") || Deno.env.get("LINE_BOOKING_GROUP_ID") || null;
  if (bookingGroup) {
    const { token } = await loadLineBookingChannel(rpcClient);
    if (token) {
      const quota = await readQuota(token, bookingGroup);
      if (canSendSmsReplyNotice(quota)) {
        const result = await pushLine(token, bookingGroup, message, input.logId);
        if (result.ok) return;
        console.warn("SMS reply LINE notification failed", { account: "booking", status: result.status });
      } else {
        console.warn("SMS reply LINE notification skipped to keep web booking quota", quota);
      }
    }
  }

  const mainToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  const mainGroup = groups.get("operations") || Deno.env.get("LINE_GROUP_ID") || null;
  if (mainToken && mainGroup) {
    const result = await pushLine(mainToken, mainGroup, message, input.logId);
    if (result.ok) return;
    console.warn("SMS reply LINE notification failed", { account: "main", status: result.status });
  }
}

Deno.serve(async (req) => {
  try {
    const p = new URLSearchParams(await req.text());
    const sid = p.get("MessageSid") || p.get("SmsSid") || "";
    const status = p.get("MessageStatus") || p.get("SmsStatus") || "";

    // 受信
    if (status === "received" || (p.get("Body") !== null && !p.get("MessageStatus"))) {
      const from = p.get("From") || "";
      const to = p.get("To") || "";
      const body = p.get("Body") || "";
      const local = from.replace(/^\+81/, "0");

      // 直近でこの番号に送ったログから店舗・予約・顧客を引き継ぐ
      const [last] = await sb(`sms_logs?to_number=eq.${encodeURIComponent(from)}&direction=eq.outbound&select=store_id,reservation_id,customer_id&order=created_at.desc&limit=1`);
      let customerId = last?.customer_id || null;
      if (!customerId) {
        const [c] = await sb(`customers?select=id&or=(phone.eq.${local},phone.eq.${encodeURIComponent(from)})&limit=1`);
        customerId = c?.id || null;
      }

      const [inserted] = await sb("sms_logs", {
        method: "POST",
        body: JSON.stringify({
          direction: "inbound", status: "received", twilio_sid: sid,
          from_number: from, to_number: to, body,
          store_id: last?.store_id || null, reservation_id: last?.reservation_id || null,
          customer_id: customerId, is_read: false,
        }),
      });

      if (inserted?.id && last?.store_id) {
        const task = notifySmsReplyToLine({
          logId: inserted.id,
          storeId: last.store_id,
          fromNumber: from,
          body,
          customerId,
          reservationId: last.reservation_id || null,
        }).catch((error) => console.error("SMS reply LINE notification error:", error));
        // Twilioへの応答を待たせないよう、使える環境では応答後にLINEへ送る
        const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(task);
        else await task;
      }
      return emptyTwiml(); // 自動返信はしない
    }

    // 送信ステータス更新
    if (sid && status) {
      const code = p.get("ErrorCode");
      await sb(`sms_logs?twilio_sid=eq.${sid}`, {
        method: "PATCH",
        body: JSON.stringify({ status, error_code: code || null, updated_at: new Date().toISOString() }),
      });
      if (status === "undelivered" || status === "failed") {
        const [l] = await sb(`sms_logs?twilio_sid=eq.${sid}&select=reservation_id`);
        if (l?.reservation_id) {
          await sb(`reservations?id=eq.${l.reservation_id}`, { method: "PATCH", body: JSON.stringify({ sms_notification_status: "failed" }) });
        }
      }
    }
    return new Response("ok");
  } catch (e) {
    console.error("sms-webhook error:", e);
    return new Response("ok"); // Twilioに再送させない
  }
});
