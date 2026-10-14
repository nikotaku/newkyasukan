// サブスクの見張り：登録したサブスク（subscription_watches）の課金が止まっていないかを判定する。
//   - { action: "cron" }            … pg_cron（private.dispatch_subscription_check、毎時13分）から。x-subscription-check-secret
//   - { action: "check", storeId }  … 支払い管理の「今すぐ確認」（ログイン中のスタッフ・所属店舗だけ）
// 判定は src/lib/subscriptionWatch.ts の evaluateWatch。悪くなったら subscription_alerts に入れる → スマホ通知（topic subscription）。
// サービスにたずねる：Twilio のアカウントの状態・SUBLINE のAPI・URLが開けるか・エステ魂の契約期間（automation_connections.contract_until）。
// メール：report_email_messages の billing_failed / billing_paid（Gmail の取り込みで見分けたもの）。

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadTwilioCredentials, twilioAuthHeader } from "../_shared/twilio.ts";
import {
  evaluateWatch,
  isWorse,
  mailMatchesWatch,
  type WatchLevel,
  type WatchSignals,
} from "../../../src/lib/subscriptionWatch.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-subscription-check-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Watch {
  id: string;
  store_id: string;
  service: string;
  name: string;
  next_billing_date: string | null;
  card_expiry: string | null;
  last_paid_at: string | null;
  silence_days: number | null;
  check_url: string | null;
  mail_keywords: string[] | null;
  level: WatchLevel;
  alerted_level: string | null;
  alerted_at: string | null;
}

interface Mail {
  kind: "billing_failed" | "billing_paid";
  subject: string;
  sender: string | null;
  received_at: string;
}

type Probe = { level: WatchLevel; message: string } | null;

const hm = (date = new Date()) => {
  const d = new Date(date.getTime() + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function probeTwilio(): Promise<Probe> {
  const credentials = await loadTwilioCredentials(sb);
  if (!credentials) return { level: "unknown", message: "Twilioの認証情報が登録されていないため、アカウントの状態をたずねられません" };
  const response = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}.json`, {
    headers: { Authorization: twilioAuthHeader(credentials) },
  }).catch(() => null);
  if (!response) return { level: "unknown", message: "Twilioにつながりませんでした" };
  if (response.status === 401 || response.status === 403) return { level: "warning", message: `Twilioにログインできません（${response.status}）。アカウントの停止・認証情報の変更を確認してください` };
  if (!response.ok) return { level: "unknown", message: `Twilioの応答がいつもと違います（${response.status}）` };
  const account = await response.json().catch(() => ({})) as { status?: string };
  if (account.status === "active") return { level: "ok", message: `Twilioのアカウントは有効（${hm()}確認）` };
  if (account.status === "suspended") return { level: "stopped", message: "Twilioのアカウントが停止（suspended）されています。支払い・残高を確認してください" };
  if (account.status === "closed") return { level: "stopped", message: "Twilioのアカウントが閉じられています（closed）" };
  return { level: "unknown", message: `Twilioのアカウントの状態：${account.status ?? "不明"}` };
}

async function probeSubline(storeId: string): Promise<Probe> {
  const { data } = await sb.rpc("get_subline_connection", { p_store_id: storeId });
  const token = (data as { token?: string | null } | null)?.token || "";
  if (!token) return { level: "unknown", message: "SUBLINEのトークンが未登録のため、たずねられません（設定 → 電話（SUBLINE））" };
  const response = await fetchWithTimeout("https://api.subline.jp/v1/setting/member/", { headers: { "x-subline-token": token } }).catch(() => null);
  if (!response) return { level: "unknown", message: "SUBLINEにつながりませんでした" };
  if (response.ok) return { level: "ok", message: `SUBLINEに接続できました（${hm()}確認）` };
  if (response.status === 401 || response.status === 403) {
    return { level: "warning", message: `SUBLINEに接続できません（${response.status}）。契約の停止・トークンの無効化を確認してください` };
  }
  if (response.status === 402) return { level: "stopped", message: "SUBLINEが支払いを求めています（402）" };
  return { level: "unknown", message: `SUBLINEの応答がいつもと違います（${response.status}）` };
}

async function probeEstama(storeId: string): Promise<Probe> {
  const { data } = await sb.from("automation_connections")
    .select("contract_until, contract_checked_at")
    .eq("store_id", storeId).eq("provider", "estama").maybeSingle();
  if (!data?.contract_until) return { level: "unknown", message: "エステ魂の契約期間をまだ読めていません（仮予約の取り込みのたびに読みます）" };
  const days = Math.floor((new Date(data.contract_until).getTime() - Date.now()) / 86_400_000);
  const until = hm(new Date(data.contract_until)).split(" ")[0];
  if (days < 0) return { level: "stopped", message: `エステ魂の契約期間（${until}まで）が過ぎています。プランが切れていないか確認してください` };
  if (days <= 3) return { level: "warning", message: `エステ魂の契約期間が${until}までです（あと${days}日）。自動更新・お支払いを確認してください` };
  return { level: "ok", message: `エステ魂の契約期間：${until}まで` };
}

async function probeUrl(url: string): Promise<Probe> {
  if (!/^https:\/\//i.test(url)) return { level: "unknown", message: "確認するURLは https:// で始めてください" };
  const response = await fetchWithTimeout(url, { method: "GET", headers: { "User-Agent": "kyasukan-subscription-check" } }).catch(() => null);
  if (!response) return { level: "warning", message: "URLが開けませんでした（つながらない・時間切れ）" };
  if (response.status === 402) return { level: "stopped", message: "URLが「支払いが必要（402）」を返しています" };
  if (response.status >= 500 || response.status === 404 || response.status === 403) {
    return { level: "warning", message: `URLが開けません（${response.status}）。サービスが止まっていないか確認してください` };
  }
  return { level: "ok", message: `URLは開けます（${response.status}・${hm()}確認）` };
}

async function probeFor(watch: Watch): Promise<Probe> {
  if (watch.service === "supabase") return { level: "ok", message: `データベースは動いています（${hm()}確認）` };
  if (watch.service === "twilio") return probeTwilio();
  if (watch.service === "subline") return probeSubline(watch.store_id);
  if (watch.service === "estama") return probeEstama(watch.store_id);
  if (watch.check_url) return probeUrl(watch.check_url);
  return null;
}

async function checkStore(storeId: string, watches: Watch[]) {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [{ data: mailRows }, { data: lastIvry }, { data: anyMail }] = await Promise.all([
    sb.from("report_email_messages").select("kind, subject, sender, received_at")
      .eq("store_id", storeId).in("kind", ["billing_failed", "billing_paid"]).gte("received_at", since)
      .order("received_at", { ascending: false }).limit(300),
    sb.from("report_email_messages").select("received_at")
      .eq("store_id", storeId).eq("kind", "ivry_call").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("report_email_messages").select("received_at")
      .eq("store_id", storeId).gte("received_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(1).maybeSingle(),
  ]);
  const mails = (mailRows ?? []) as Mail[];
  const gmailSyncActive = Boolean(anyMail);
  const results = [];

  for (const watch of watches) {
    const probe = await probeFor(watch).catch((error) => ({ level: "unknown" as WatchLevel, message: `確認できませんでした：${String(error).slice(0, 80)}` }));
    const mine = mails.filter((mail) => mailMatchesWatch(mail, watch));
    const failed = mine.find((mail) => mail.kind === "billing_failed") ?? null;
    const paid = mine.find((mail) => mail.kind === "billing_paid") ?? null;
    const signals: WatchSignals = {
      probe,
      failedMail: failed,
      paidMail: paid,
      activityTracked: watch.service === "ivry" ? gmailSyncActive : false,
      lastActivityAt: watch.service === "ivry" ? (lastIvry?.received_at ?? null) : null,
    };
    const result = evaluateWatch(watch, signals);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      level: result.level,
      reasons: result.reasons.slice(0, 6),
      last_checked_at: now,
      updated_at: now,
    };
    if (result.level === "ok") {
      update.last_ok_at = now;
      update.alerted_level = "ok";
    }
    // 領収書のメールが来ていれば、最後に払った日として覚える
    if (paid && (!watch.last_paid_at || new Date(paid.received_at) > new Date(watch.last_paid_at))) update.last_paid_at = paid.received_at;

    // 悪くなったとき・止まったままのときは1日1回知らせる
    const stillStopped = result.level === "stopped" && watch.alerted_level === "stopped"
      && (!watch.alerted_at || Date.now() - new Date(watch.alerted_at).getTime() > 24 * 3_600_000);
    if (isWorse(result.level, (watch.alerted_level as WatchLevel | null) ?? "ok") || stillStopped) {
      const level = result.level as "warning" | "stopped";
      const message = result.reasons.filter(Boolean).join(" / ").slice(0, 300) || "確認してください";
      const { error } = await sb.from("subscription_alerts").insert({ store_id: watch.store_id, watch_id: watch.id, level, message });
      if (!error) {
        update.alerted_level = level;
        update.alerted_at = now;
      } else {
        console.error("subscription alert insert failed", error);
      }
    }
    await sb.from("subscription_watches").update(update).eq("id", watch.id);
    results.push({ id: watch.id, name: watch.name, level: result.level, reasons: result.reasons });
  }
  return results;
}

const watchColumns = "id,store_id,service,name,next_billing_date,card_expiry,last_paid_at,silence_days,check_url,mail_keywords,level,alerted_level,alerted_at";

async function memberOf(req: Request, storeId: string) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await sb.auth.getUser(jwt);
  if (!data.user) return false;
  const { data: link } = await sb.from("user_stores").select("user_id").eq("user_id", data.user.id).eq("store_id", storeId).maybeSingle();
  return Boolean(link);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({})) as { action?: string; storeId?: string };

    if (body.action === "cron") {
      const secret = req.headers.get("x-subscription-check-secret");
      const { data: ok } = secret ? await sb.rpc("verify_subscription_check_secret", { candidate: secret }) : { data: false };
      if (ok !== true) return json({ error: "権限がありません" }, 403);
      const { data, error } = await sb.from("subscription_watches").select(watchColumns).eq("is_active", true);
      if (error) throw error;
      const byStore = new Map<string, Watch[]>();
      for (const watch of (data ?? []) as Watch[]) byStore.set(watch.store_id, [...(byStore.get(watch.store_id) ?? []), watch]);
      const results = [];
      for (const [storeId, watches] of byStore) results.push(...await checkStore(storeId, watches));
      console.log(JSON.stringify({ event: "subscription_check", watches: results.length, notOk: results.filter((r) => r.level !== "ok").length }));
      return json({ checked: results.length });
    }

    if (body.action === "check") {
      const storeId = typeof body.storeId === "string" ? body.storeId : "";
      if (!/^[0-9a-f-]{36}$/i.test(storeId)) return json({ error: "店舗が指定されていません" }, 400);
      if (!(await memberOf(req, storeId))) return json({ error: "ログインしてください" }, 401);
      const { data, error } = await sb.from("subscription_watches").select(watchColumns).eq("store_id", storeId).eq("is_active", true);
      if (error) throw error;
      return json({ results: await checkStore(storeId, (data ?? []) as Watch[]) });
    }

    return json({ error: "action が不正です" }, 400);
  } catch (error) {
    console.error("subscription-check error:", error);
    return json({ error: "確認できませんでした" }, 500);
  }
});
