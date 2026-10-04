// セラピストへの予約通知（確定・変更・キャンセル）を送る。
//  - pg_cron（30秒ごと）から { } … x-therapist-notify-secret（Vault の therapist_notify_internal_secret）
//    therapist_notifications の送る時刻になったものを取り、
//    ① セラピストのマイページ（ホーム画面に追加）へプッシュ通知
//    ② 端末が無い人だけ、移行中は本人のLINEグループへ（共通グループには送らない）
//    ③ どちらも無い・送れない → 管理画面のスマホ通知（topic therapist_notify）で知らせる
//    予約の確定・変更・キャンセルのほか、SNSアカウント（X・O2）の準備ができたお知らせ（kind = sns_ready）も送る
//  - マイページから { action: "test", token } … 本人の端末にテスト通知を送る
// VAPIDの鍵は Vault（RPC get_web_push_vapid）。暗号化と署名は _shared/webPush.ts。

import { sendWebPush, type VapidKeys } from "../_shared/webPush.ts";
import { pushLineText } from "../_shared/linePush.ts";
import type { ReservationLineContext } from "../notify-line-therapist/reservationLineNotification.ts";
import {
  buildSnsReadyLineText,
  buildSnsReadyPush,
  buildTherapistLineText,
  buildTherapistPush,
  unreachableAdminMessage,
  whenLabel,
  type CancelledSnapshot,
  type ReservationChanges,
  type TherapistNotificationKind,
} from "./messages.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const VAPID_SUBJECT = "https://enka-salon.jp";
const MAX_ATTEMPTS = 3;

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

interface Notification {
  id: string;
  store_id: string;
  cast_id: string;
  reservation_id: string | null;
  kind: TherapistNotificationKind;
  changes: ReservationChanges;
  snapshot: CancelledSnapshot;
  source: string;
  attempts: number;
}

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

/** 購読へ送る。送れなくなった購読は消す。1台でも届けば true */
async function deliver(table: "therapist_push_subscriptions" | "push_subscriptions", subscriptions: Subscription[], message: unknown, topic: string) {
  if (!subscriptions.length) return { sent: 0, errors: [] as string[] };
  const keys = await vapid();
  const errors: string[] = [];
  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    const result = await sendWebPush(subscription, message, keys, { topic });
    const now = new Date().toISOString();
    if (result.ok) sent += 1;
    else errors.push(result.error ?? `push ${result.status}`);
    if (result.gone) {
      await sb(`${table}?id=eq.${subscription.id}`, { method: "DELETE" }).catch(() => null);
    } else {
      await sb(`${table}?id=eq.${subscription.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(result.ok
          ? { last_success_at: now, last_error: null, failure_count: 0 }
          : { last_error: result.error ?? `push ${result.status}`, failure_count: subscription.failure_count + 1 }),
      }).catch(() => null);
    }
  }));
  return { sent, errors };
}

const subscriptionColumns = "id,endpoint,p256dh,auth,failure_count";

async function finish(id: string, patch: Record<string, unknown>) {
  await sb(`therapist_notifications?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function notifyAdmins(notification: Notification, castName: string, when: string, reason: "no_device" | "failed") {
  const admins: Subscription[] = (await sb(
    `push_subscriptions?topics=cs.{therapist_notify}&store_id=eq.${notification.store_id}&select=${subscriptionColumns}`,
  )) ?? [];
  const message = unreachableAdminMessage({ castName, kind: notification.kind, when, reason, notificationId: notification.id });
  await deliver("push_subscriptions", admins, message, message.tag).catch(() => null);
}

async function processNotification(notification: Notification) {
  const [cast] = await sb(`casts?id=eq.${notification.cast_id}&select=id,name,access_token,line_group_id`);
  if (!cast) {
    await finish(notification.id, { status: "skipped", error_message: "セラピストが見つかりません" });
    return "skipped";
  }

  let context: ReservationLineContext | null = null;
  if (notification.kind === "new" || notification.kind === "changed") {
    const [reservation] = notification.reservation_id
      ? await sb(`reservations?id=eq.${notification.reservation_id}&select=status,cast_id`)
      : [null];
    if (!reservation || reservation.status !== "confirmed" || reservation.cast_id !== notification.cast_id) {
      await finish(notification.id, { status: "skipped", error_message: "送る前に予約が取り消し・担当変更されたため送っていません" });
      return "skipped";
    }
    context = await rpc("get_reservation_line_context", { p_reservation_id: notification.reservation_id }) as ReservationLineContext | null;
    if (!context) {
      await finish(notification.id, { status: "skipped", error_message: "予約が見つかりません" });
      return "skipped";
    }
  }

  const when = notification.kind === "sns_ready"
    ? ""
    : notification.kind === "cancelled"
    ? whenLabel(notification.snapshot?.reservation_date, notification.snapshot?.start_time)
    : whenLabel(context!.reservation_date, context!.start_time);
  const portalUrl = cast.access_token ? `/therapist/${cast.access_token}` : "/";

  // ① マイページへのプッシュ通知
  const devices: Subscription[] = (await sb(
    `therapist_push_subscriptions?cast_id=eq.${cast.id}&select=${subscriptionColumns}`,
  )) ?? [];
  const pushMessage = notification.kind === "sns_ready"
    ? buildSnsReadyPush({ portalUrl, castId: cast.id })
    : buildTherapistPush({
      kind: notification.kind,
      portalUrl,
      notificationId: notification.id,
      reservationId: notification.reservation_id,
      context,
      changes: notification.changes,
      snapshot: notification.snapshot,
    });
  const pushed = await deliver("therapist_push_subscriptions", devices, pushMessage, pushMessage.tag);
  if (pushed.sent > 0) {
    await finish(notification.id, { status: "sent", channel: "push", sent_at: new Date().toISOString(), error_message: null });
    return "sent";
  }

  // ② 端末が無い人だけ、移行中は本人のLINEグループへ
  let lineError = "";
  let lineQuotaExceeded = false;
  if (!devices.length && cast.line_group_id && LINE_TOKEN) {
    const text = notification.kind === "sns_ready"
      ? buildSnsReadyLineText()
      : buildTherapistLineText({ kind: notification.kind, context, changes: notification.changes, snapshot: notification.snapshot });
    const line = await pushLineText(LINE_TOKEN, cast.line_group_id, text, notification.id);
    if (line.ok) {
      await finish(notification.id, { status: "sent", channel: "line", sent_at: new Date().toISOString(), error_message: null });
      return "sent";
    }
    lineQuotaExceeded = line.status === 429;
    lineError = lineQuotaExceeded ? "LINEの月の送信上限に達しています" : `LINEに送れませんでした（${line.status}）`;
  }

  // ③ 送れなかった
  if (!devices.length && !cast.line_group_id) {
    await finish(notification.id, { status: "unreachable", error_message: "マイページのスマホ通知が未設定です" });
    await notifyAdmins(notification, cast.name, when, "no_device");
    return "unreachable";
  }
  const error = [pushed.errors[0], lineError].filter(Boolean).join(" / ") || "送信に失敗しました";
  // LINEの月の上限は待っても戻らないので、すぐ管理画面に知らせる
  if (notification.attempts < MAX_ATTEMPTS && !lineQuotaExceeded) {
    await finish(notification.id, {
      status: "queued",
      available_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      error_message: error.slice(0, 500),
    });
    return "retry";
  }
  await finish(notification.id, { status: "failed", error_message: error.slice(0, 500) });
  await notifyAdmins(notification, cast.name, when, "failed");
  return "failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json().catch(() => ({})) as { action?: string; token?: string };

    // マイページからのテスト通知（本人のトークンで、本人の端末にだけ送る）
    if (input.action === "test") {
      const token = typeof input.token === "string" ? input.token.trim() : "";
      if (!token || token.length > 200) return json({ error: "マイページのURLが正しくありません" }, 400);
      const [cast] = await sb(`casts?access_token=eq.${encodeURIComponent(token)}&select=id,name`);
      if (!cast) return json({ error: "マイページのURLが正しくありません" }, 403);
      const devices: Subscription[] = (await sb(`therapist_push_subscriptions?cast_id=eq.${cast.id}&select=${subscriptionColumns}`)) ?? [];
      if (!devices.length) return json({ error: "この端末はまだ通知を受け取る設定になっていません" }, 400);
      const result = await deliver("therapist_push_subscriptions", devices, {
        title: "✅ 通知のテスト",
        body: `${cast.name}さんの端末に通知が届きました。この通知をタップすると設定完了です`,
        // タップして開くと、マイページが「届いた」と記録する（管理画面の完了状況に出る）
        url: `/therapist/${token}?push_test=1`,
        tag: "therapist-test",
        icon: "/therapist-app/icon-192.png",
      }, "therapist-test");
      if (result.sent > 0) {
        await sb(`therapist_push_subscriptions?cast_id=eq.${cast.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ test_sent_at: new Date().toISOString() }),
        }).catch(() => null);
      }
      return json({ targets: devices.length, sent: result.sent });
    }

    const secret = req.headers.get("x-therapist-notify-secret");
    const verified = secret ? await rpc("verify_therapist_notify_secret", { candidate: secret }) : false;
    if (verified !== true) return json({ error: "権限がありません" }, 403);

    const notifications = (await rpc("claim_therapist_notifications", { p_limit: 20 })) as Notification[] ?? [];
    const results: Record<string, number> = {};
    for (const notification of notifications) {
      let outcome = "error";
      try {
        outcome = await processNotification(notification);
      } catch (error) {
        console.error("notify-therapist item error:", error);
        await finish(notification.id, {
          status: notification.attempts < MAX_ATTEMPTS ? "queued" : "failed",
          available_at: new Date(Date.now() + 2 * 60_000).toISOString(),
          error_message: String(error).slice(0, 500),
        }).catch(() => null);
      }
      results[outcome] = (results[outcome] ?? 0) + 1;
    }
    console.log(JSON.stringify({ event: "notify_therapist", claimed: notifications.length, results }));
    return json({ claimed: notifications.length, results });
  } catch (error) {
    console.error("notify-therapist error:", error);
    return json({ error: "通知を送れませんでした" }, 500);
  }
});
