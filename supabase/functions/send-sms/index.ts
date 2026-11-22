// 予約確認などのSMS送信（Twilio）。
// リクエスト(JSON):
//   { reservation_id } / { reservation_id, template_id } / { to, body, store_id? }
//   { reservation_id, to, preview_only? } … 予約内容で本文を作り、別の宛先へ送る（予約は送信済みにしない）
//   { action: "reservation_reminder", reminder_reservation_id } … 前日リマインド（内部専用）
//   { action: "retry", retry_log_id } … 送れなかった・届かなかったSMSを同じ文面で送り直す（内部専用。pg_cron sms-retry-every-minute → private.dispatch_sms_retries）
//   { action: "numbers" }   … 番号一覧
//   { action: "configure" } … SMS対応番号の受信Webhookをsms-webhookに設定
// テンプレ変数は template.ts を参照（{guide_url} は予約ごとの案内ページ /g/:token）。
//
// 呼び出せるのは次のどれか（公開鍵だけでは送れない。料金がかかるため）:
//   - 予約確定トリガー: x-send-sms-secret（Vault の send_sms_internal_secret）
//   - 他のEdge Function: service_role
//   - 管理画面: ログイン中のスタッフ（送信先の予約・店舗に所属していること）

import { businessDateLong, businessDateShort, businessDateTime } from "../../../src/lib/businessTime.ts";
import { loadTwilioCredentials, twilioAuthHeader, type TwilioCredentials } from "../_shared/twilio.ts";
import { fillTemplate, paymentGuideNote, reservationGuideUrl, toE164 } from "./template.ts";

const TW_FROM = Deno.env.get("TWILIO_SMS_FROM") || "";
const TW_MSID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_URL = `${SB_URL}/functions/v1/sms-webhook`;
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, Prefer: "return=representation", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t}`);
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

// admin = どこかの店舗のオーナー・マネージャー（番号一覧・Webhook設定ができる）。
// 管理権限は user_stores の role で持つ（このプロジェクトに user_roles テーブルはない）
type Caller = { kind: "internal" } | { kind: "user"; admin: boolean; storeIds: string[] };

async function authorize(req: Request): Promise<Caller | null> {
  const secret = req.headers.get("x-send-sms-secret");
  if (secret) {
    const { data, error } = await rpcClient.rpc("verify_send_sms_secret", { candidate: secret });
    if (!error && data === true) return { kind: "internal" };
  }
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!jwt) return null;
  if (jwt === SB_KEY) return { kind: "internal" };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null;
  const user = await r.json();
  if (!user?.id) return null;
  const memberships = (await sb(`user_stores?user_id=eq.${user.id}&select=store_id,role`)) as Array<{ store_id: string; role: string }> | null;
  const storeIds = (memberships || []).map((row) => row.store_id);
  if (!storeIds.length) return null;
  const admin = (memberships || []).some((row) => row.role === "owner" || row.role === "manager");
  return { kind: "user", admin, storeIds };
}

const canUseStore = (caller: Caller, storeId: string | null) =>
  caller.kind === "internal" || (storeId !== null && caller.storeIds.includes(storeId));

let credentialsCache: TwilioCredentials | null = null;
async function twilioCredentials() {
  if (!credentialsCache) credentialsCache = await loadTwilioCredentials(rpcClient);
  if (!credentialsCache) throw new Error("Twilioの認証情報が設定されていません");
  return credentialsCache;
}

async function twilioFetch(path: string, init: RequestInit = {}) {
  const credentials = await twilioCredentials();
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}${path}`, {
    ...init,
    headers: { Authorization: twilioAuthHeader(credentials), ...(init.headers || {}) },
  });
}

async function listNumbers() {
  const r = await twilioFetch("/IncomingPhoneNumbers.json?PageSize=50");
  const d = await r.json();
  if (!r.ok) throw new Error(`twilio ${d.code ?? r.status}: ${d.message ?? ""}`);
  return (d.incoming_phone_numbers || []).map((n: any) => ({
    sid: n.sid, number: n.phone_number, name: n.friendly_name,
    sms: !!n.capabilities?.sms, voice: !!n.capabilities?.voice, sms_url: n.sms_url,
  }));
}

let cachedFrom = "";
async function resolveFrom(): Promise<string> {
  if (TW_FROM) return TW_FROM;
  if (cachedFrom) return cachedFrom;
  const configured = (await twilioCredentials()).smsFrom;
  if (configured) {
    cachedFrom = configured;
    return cachedFrom;
  }
  const n = (await listNumbers()).find((x: any) => x.sms);
  if (!n) throw new Error("SMS対応の番号がアカウントにありません");
  cachedFrom = n.number;
  return cachedFrom;
}

async function buildVars(r: Record<string, any>) {
  // 深夜（6時前）は前日の24時台・25時台で書く（11/18 0:00 → 11/17 24:00）
  const when = businessDateTime(r.reservation_date, r.start_time);
  let cast = "";
  if (r.cast_id) {
    const [c] = await sb(`casts?id=eq.${r.cast_id}&select=name`);
    cast = c?.name || "";
  }
  let room: any = null;
  if (r.room) {
    const q = `rooms?name=eq.${encodeURIComponent(r.room)}&select=name,display_name,address,map_url,sms_landmark&limit=1` + (r.store_id ? `&store_id=eq.${r.store_id}` : "");
    [room] = await sb(q);
  }
  const [store] = r.store_id ? await sb(`stores?id=eq.${r.store_id}&select=custom_domain`) : [null];
  const guideUrl = reservationGuideUrl(store?.custom_domain, r.guide_token);
  return {
    name: r.customer_name || "お客",
    date: businessDateShort(when),
    date_long: businessDateLong(when),
    time: when?.time ?? "",
    course: r.course_name || "",
    duration: r.duration ? String(r.duration) : "",
    cast,
    nomination: r.nomination_type || "フリー",
    price: r.price != null ? Number(r.price).toLocaleString("ja-JP") : "",
    room: r.room || "",
    room_address: room?.address || "",
    room_landmark: room?.sms_landmark || "",
    room_map: room?.map_url || "",
    guide_url: guideUrl,
    payment_guide: paymentGuideNote(r, guideUrl),
    free_service: Number(r.free_service_minutes) > 0 ? `🎁${r.free_service_minutes}分無料サービス付き` : "",
  } as Record<string, string>;
}

const ENKA_STORE_ID = "404499ab-5350-490f-9608-5814faffda6f";
const REMINDER_TPL = "艶華です。明日{date_long} {time}からご予約を承っています。変更の際はお早めにご連絡ください。";
const DEFAULT_TPL = "{name}様\nご予約を承りました。\n{date} {time}〜 {course}\nご来店をお待ちしております。";

// 送れなかった・届かなかったSMSを、同じ文面・同じ宛先でもう一度送る。送り直しは新しい行（retry_of = 最初の行）。
// また失敗したら、その行の status の更新で DB（private.sms_schedule_retry）が次の送り直しを決める
async function retrySms(logId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(logId)) return { ok: false, error: "invalid log id" };
  const [log] = await sb(`sms_logs?id=eq.${logId}&select=*`);
  if (!log || log.retry_state !== "sending" || log.direction === "inbound") return { ok: true, skipped: true };
  const root = log.retry_of || log.id;
  const finish = (state: string) => sb(`sms_logs?id=eq.${log.id}`, {
    method: "PATCH",
    body: JSON.stringify({ retry_state: state, next_retry_at: null, updated_at: new Date().toISOString() }),
  });
  // 同じSMSの送り直しが、別の経路（手で再送など）で既に届いていればやめる
  const [delivered] = await sb(`sms_logs?or=(id.eq.${root},retry_of.eq.${root})&status=in.(delivered,sent,queued,accepted,sending)&id=neq.${log.id}&select=id&created_at=gt.${encodeURIComponent(log.created_at)}&limit=1`);
  if (delivered) { await finish("done"); return { ok: true, skipped: true, reason: "already_sent" }; }
  if (log.reservation_id) {
    const [reservation] = await sb(`reservations?id=eq.${log.reservation_id}&select=status`);
    if (reservation?.status === "cancelled") { await finish("stopped"); return { ok: true, skipped: true, reason: "cancelled" }; }
  }
  const toE = toE164(log.to_number);
  if (!toE || !String(log.body || "").trim()) { await finish("gave_up"); return { ok: false, error: "宛先か本文がありません" }; }

  const fromNum = TW_MSID ? null : await resolveFrom();
  const [retry] = await sb("sms_logs", {
    method: "POST",
    body: JSON.stringify({
      store_id: log.store_id, reservation_id: log.reservation_id, template_id: log.template_id,
      to_number: toE, from_number: fromNum, body: log.body, direction: "outbound", customer_id: log.customer_id,
      retry_of: root, retry_count: Number(log.retry_count || 0) + 1, created_by: log.created_by ?? null,
    }),
  });
  await finish("done");

  const form = new URLSearchParams({ To: toE, Body: log.body, StatusCallback: WEBHOOK_URL });
  if (TW_MSID) form.set("MessagingServiceSid", TW_MSID); else form.set("From", fromNum!);
  const tw = await twilioFetch("/Messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const res = await tw.json();
  await sb(`sms_logs?id=eq.${retry.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: tw.ok ? (res.status || "sent") : "failed", twilio_sid: res.sid || null,
      error_code: tw.ok ? null : String(res.code ?? ""), error_message: tw.ok ? null : res.message ?? null,
      updated_at: new Date().toISOString(),
    }),
  });
  console.log(JSON.stringify({ event: "sms_retry", root, attempt: retry.retry_count, ok: tw.ok, code: tw.ok ? null : res.code }));
  return { ok: tw.ok, log_id: retry.id, attempt: retry.retry_count };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const caller = await authorize(req);
    if (!caller) return json({ error: "権限がありません" }, 403);
    const input = await req.json().catch(() => ({}));

    if (input.action === "numbers" || input.action === "configure") {
      if (caller.kind !== "internal" && !caller.admin) return json({ error: "権限がありません" }, 403);
      if (input.action === "numbers") return json({ numbers: await listNumbers() });
      const results = [];
      for (const n of (await listNumbers()).filter((x: any) => x.sms)) {
        const r = await twilioFetch(`/IncomingPhoneNumbers/${n.sid}.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ SmsUrl: WEBHOOK_URL, SmsMethod: "POST" }),
        });
        const d = await r.json();
        results.push({ number: n.number, ok: r.ok, sms_url: d.sms_url, error: r.ok ? null : d.message });
      }
      return json({ results });
    }

    if (input.action === "retry") {
      if (caller.kind !== "internal") return json({ error: "権限がありません" }, 403);
      return json(await retrySms(String(input.retry_log_id || "")));
    }

    const isReminder = input.action === "reservation_reminder";
    if (isReminder && caller.kind !== "internal") return json({ error: "権限がありません" }, 403);
    if (isReminder && !/^[0-9a-f-]{36}$/i.test(input.reminder_reservation_id || "")) {
      return json({ error: "invalid reservation id" }, 400);
    }

    let reminderKey: string | null = null;
    let to: string = input.to || "";
    let body: string = input.body || "";
    let storeId: string | null = input.store_id || null;
    const reservationId: string | null = (isReminder ? input.reminder_reservation_id : input.reservation_id) || null;
    let templateId: string | null = input.template_id || null;
    let customerId: string | null = input.customer_id || null;
    const redirected = !!(reservationId && input.to);

    if (reservationId) {
      const [r] = await sb(`reservations?id=eq.${reservationId}&select=*`);
      if (!r) return json({ error: "reservation not found" }, 404);
      storeId = r.store_id;
      to = to || r.customer_phone;
      if (isReminder) {
        const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
        // 「明日」は営業日で見る（11/18 0:00 の予約＝11/17 24:00 は 11/16 に送る）
        if (storeId !== ENKA_STORE_ID || r.status !== "confirmed" ||
            businessDateTime(r.reservation_date, r.start_time)?.date !== tomorrow ||
            !r.start_time || !toE164(r.customer_phone)) return json({ ok: true, skipped: true });
        to = r.customer_phone;
        templateId = null;
        customerId = null;
        reminderKey = `${r.id}/${r.reservation_date}/${r.start_time}`;
        body = fillTemplate(REMINDER_TPL, await buildVars(r));
      } else if (!body) {
        let tpl = DEFAULT_TPL;
        const q = templateId
          ? `sms_auto_templates?id=eq.${templateId}&store_id=eq.${r.store_id}&select=id,message`
          : `sms_auto_templates?store_id=eq.${r.store_id}&trigger=eq.reservation_confirmed&is_active=eq.true&select=id,message&limit=1`;
        const [t] = await sb(q);
        if (t?.message) { tpl = t.message; templateId = t.id; }
        body = fillTemplate(tpl, await buildVars(r));
      }
    }

    if (!canUseStore(caller, storeId)) return json({ error: "この店舗のSMSは送れません" }, 403);
    if (input.preview_only) return json({ ok: true, preview: body });

    const toE = toE164(to);
    if (!toE) return json({ error: `invalid phone: ${to}` }, 400);
    if (!body.trim()) return json({ error: "empty body" }, 400);

    if (!customerId) {
      const local = toE.replace(/^\+81/, "0");
      const q = `customers?select=id&or=(phone.eq.${local},phone.eq.${encodeURIComponent(toE)})&limit=1` + (storeId ? `&store_id=eq.${storeId}` : "");
      const [c] = await sb(q).catch(() => [null]);
      customerId = c?.id || null;
    }

    const fromNum = TW_MSID ? null : await resolveFrom();
    // リマインドは確定SMSの送信状態と分けて記録する。
    const [log] = await sb(isReminder ? "sms_logs?on_conflict=reservation_reminder_key" : "sms_logs", {
      method: "POST",
      ...(isReminder ? { headers: { Prefer: "resolution=ignore-duplicates,return=representation" } } : {}),
      body: JSON.stringify({
        store_id: storeId, reservation_id: redirected || isReminder ? null : reservationId, template_id: templateId,
        ...(isReminder ? { reservation_reminder_key: reminderKey } : {}),
        to_number: toE, from_number: fromNum, body, direction: "outbound", customer_id: customerId,
      }),
    });

    if (isReminder && !log) return json({ ok: true, skipped: true });

    const form = new URLSearchParams({ To: toE, Body: body, StatusCallback: WEBHOOK_URL });
    if (TW_MSID) form.set("MessagingServiceSid", TW_MSID); else form.set("From", fromNum!);

    const tw = await twilioFetch("/Messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const res = await tw.json();
    const ok = tw.ok;
    const now = new Date().toISOString();

    await sb(`sms_logs?id=eq.${log.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: ok ? (res.status || "sent") : "failed", twilio_sid: res.sid || null,
        error_code: ok ? null : String(res.code ?? ""), error_message: ok ? null : res.message ?? null, updated_at: now,
      }),
    });
    if (reservationId && !redirected && !isReminder) {
      await sb(`reservations?id=eq.${reservationId}`, {
        method: "PATCH",
        body: JSON.stringify({ sms_notification_status: ok ? "sent" : "failed", sms_notification_sent_at: ok ? now : null }),
      });
    }

    return ok
      ? json({ ok: true, sid: res.sid, log_id: log.id, to: toE, body })
      : json({ ok: false, error: res.message, code: res.code }, 502);
  } catch (e) {
    console.error("send-sms error:", e);
    return json({ error: String(e) }, 500);
  }
});
