// X運用表の「決まった形の投稿」（出勤・空き枠・ピックアップ・イベント・口コミ）を、運用表の時間に自動で X へ出す。
//  - { action: "run" } … pg_cron（5分ごと・x-auto-post-secret）。自動投稿がオンのアカウントを全店舗まとめて処理
//  - { action: "run", store_id } … 管理画面の「今すぐ確認」（ログイン中の店長・オーナー）
//  - { action: "verify", channel_id } … 登録したキーで X につながるか確かめ、@ID を入れる
// AI で作る投稿は人が確認してから出すので、ここでは出さない。投稿の結果は x_daily_posts（今日の投稿）と
// store_post_channels（SNS連携管理の「店舗の投稿先」）に残す。失敗が続いた・キーが無効なときは自動投稿を止める。

import { createClient } from "npm:@supabase/supabase-js@2";
import { postTweet, tweetUrl, verifyCredentials, type XCredentials } from "../_shared/xApi.ts";
import { loadXPostContext, tokyoClock } from "../../../src/lib/xPostContext.ts";
import { AUTO_POST_MAX_ATTEMPTS, decideAutoPost, type SavedXPost } from "../../../src/lib/xAutoPost.ts";
import { buildDailyPosts, businessDate } from "../../../src/lib/xDailyPosts.ts";
import { DEFAULT_X_OPERATIONS_PLAN, normalizeXOperationsPlan, X_OPS_CONTENT_KEY } from "../../../src/lib/xOperationsPlan.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const FALLBACK_SITE = "https://enka-salon.jp";
// この回数続けて失敗したら、人が確認するまで自動投稿を止める
const PAUSE_AFTER_FAILURES = 3;

const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Channel {
  id: string;
  store_id: string;
  account_key: string;
  label: string;
  handle: string | null;
  consecutive_failures: number;
}

async function credentialsFor(channelId: string): Promise<XCredentials | null> {
  const { data } = await admin.rpc("get_store_post_channel_secrets", { p_channel_id: channelId });
  const s = (data ?? {}) as Record<string, string>;
  if (!s.api_key || !s.api_secret || !s.access_token || !s.access_token_secret) return null;
  return { apiKey: s.api_key, apiSecret: s.api_secret, accessToken: s.access_token, accessTokenSecret: s.access_token_secret };
}

async function channelFailed(channel: Channel, error: string, needsAttention: boolean) {
  const failures = channel.consecutive_failures + 1;
  channel.consecutive_failures = failures;
  const pause = needsAttention || failures >= PAUSE_AFTER_FAILURES;
  await admin.from("store_post_channels").update({
    last_error: error,
    last_error_at: new Date().toISOString(),
    consecutive_failures: failures,
    ...(pause ? { paused_at: new Date().toISOString(), pause_reason: needsAttention ? error : `${failures}回続けて失敗したので止めました：${error}` } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", channel.id);
  return pause;
}

async function recordSkip(storeId: string, date: string, channel: Channel, slotKey: string, reason: string, current?: SavedXPost & { error_message?: string | null }) {
  if (current?.publish_status === "skipped" && current.error_message === reason) return;
  await admin.from("x_daily_posts").upsert({
    store_id: storeId,
    post_date: date,
    account_key: channel.account_key,
    slot_key: slotKey,
    publish_status: "skipped",
    channel_id: channel.id,
    error_message: reason,
    updated_at: new Date().toISOString(),
  }, { onConflict: "store_id,post_date,account_key,slot_key" });
}

async function processStore(storeId: string, now: Date) {
  const [{ data: store }, { data: planRow }, { data: channels }] = await Promise.all([
    admin.from("stores").select("id,name,custom_domain").eq("id", storeId).maybeSingle(),
    admin.from("site_content").select("value").eq("store_id", storeId).eq("key", X_OPS_CONTENT_KEY).maybeSingle(),
    admin.from("store_post_channels").select("id,store_id,account_key,label,handle,consecutive_failures")
      .eq("store_id", storeId).eq("platform", "x").eq("auto_post", true).is("paused_at", null),
  ]);
  if (!store || !channels?.length) return { store: storeId, posted: 0, results: [] };

  let plan = DEFAULT_X_OPERATIONS_PLAN;
  try {
    if (planRow?.value) plan = normalizeXOperationsPlan(JSON.parse(planRow.value as string));
  } catch {
    // 壊れていれば初期の運用表で動かす
  }

  const date = businessDate(now);
  const clock = tokyoClock(now);
  const { context, errors } = await loadXPostContext(admin, {
    storeId,
    storeName: store.name,
    customDomain: store.custom_domain,
    fallbackBaseUrl: FALLBACK_SITE,
    date,
    now,
  });
  const { data: savedRows } = await admin.from("x_daily_posts")
    .select("account_key,slot_key,text,text_source,posted_at,publish_status,attempts,error_message")
    .eq("store_id", storeId).eq("post_date", date);
  const saved = new Map((savedRows ?? []).map((row) => [`${row.account_key}::${row.slot_key}`, row as SavedXPost & { error_message: string | null }]));

  const results: Array<{ account: string; slot: string; action: string; detail?: string }> = [];
  let posted = 0;
  for (const channel of channels as Channel[]) {
    const account = plan.accounts.find((a) => a.key === channel.account_key);
    if (!account) {
      await channelFailed(channel, `X運用表に「${channel.account_key}」のアカウントがありません。投稿先の設定を確認してください`, true);
      results.push({ account: channel.account_key, slot: "-", action: "paused", detail: "運用表にアカウントがありません" });
      continue;
    }
    let credentials: XCredentials | null | undefined;
    for (const post of buildDailyPosts([account], context)) {
      const current = saved.get(`${channel.account_key}::${post.slotKey}`);
      const decision = decideAutoPost(post, current, clock.minutes);
      if (decision.action === "wait" || decision.action === "done") continue;
      if (decision.action === "skip" && post.kind === "ai") continue;
      if (decision.action === "skip" || decision.action === "missed") {
        // データを読めなかったときは、出勤なしと誤って見送らない
        if (errors.length && decision.action === "skip") continue;
        await recordSkip(storeId, date, channel, post.slotKey, decision.reason ?? "見送り", current);
        results.push({ account: channel.account_key, slot: post.slotKey, action: decision.action, detail: decision.reason ?? undefined });
        continue;
      }
      if (errors.length) {
        results.push({ account: channel.account_key, slot: post.slotKey, action: "wait", detail: errors.join(" / ") });
        continue;
      }

      if (credentials === undefined) credentials = await credentialsFor(channel.id);
      if (!credentials) {
        await channelFailed(channel, "Xのキーが登録されていません", true);
        results.push({ account: channel.account_key, slot: post.slotKey, action: "paused", detail: "キー未登録" });
        break;
      }
      const { data: claimed } = await admin.rpc("claim_x_auto_post", {
        p_store_id: storeId,
        p_post_date: date,
        p_account_key: channel.account_key,
        p_slot_key: post.slotKey,
        p_channel_id: channel.id,
        p_max_attempts: AUTO_POST_MAX_ATTEMPTS,
      });
      if (!claimed) continue;

      const result = await postTweet(credentials, decision.text);
      const nowIso = new Date().toISOString();
      if (result.ok && result.id) {
        const url = tweetUrl(channel.handle, result.id);
        await admin.from("x_daily_posts").update({
          publish_status: "posted",
          posted_at: nowIso,
          posted_text: decision.text,
          tweet_id: result.id,
          post_url: url,
          error_message: null,
          updated_at: nowIso,
        }).eq("store_id", storeId).eq("post_date", date).eq("account_key", channel.account_key).eq("slot_key", post.slotKey);
        await admin.from("store_post_channels").update({
          last_success_at: nowIso,
          last_post_url: url,
          consecutive_failures: 0,
          updated_at: nowIso,
        }).eq("id", channel.id);
        channel.consecutive_failures = 0;
        posted += 1;
        results.push({ account: channel.account_key, slot: post.slotKey, action: "posted", detail: url });
      } else {
        const error = result.error ?? "投稿できませんでした";
        await admin.from("x_daily_posts").update({ publish_status: "failed", error_message: error, updated_at: nowIso })
          .eq("store_id", storeId).eq("post_date", date).eq("account_key", channel.account_key).eq("slot_key", post.slotKey);
        const paused = await channelFailed(channel, error, !!result.needsAttention);
        results.push({ account: channel.account_key, slot: post.slotKey, action: "failed", detail: error });
        if (paused) break;
      }
    }
  }
  return { store: storeId, posted, results };
}

async function signedInUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? authorization : null;
}

// ログイン中の人がその店舗の店長・オーナーか（can_manage_store をその人の権限で呼ぶ）
async function canManage(authorization: string, storeId: string) {
  const response = await fetch(`${SB_URL}/rest/v1/rpc/can_manage_store`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ p_store_id: storeId }),
  });
  return response.ok && (await response.json().catch(() => false)) === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json().catch(() => ({})) as { action?: string; store_id?: string; channel_id?: string };
    const now = new Date();

    const secret = req.headers.get("x-auto-post-secret");
    if (secret) {
      const { data: ok } = await admin.rpc("verify_x_auto_post_secret", { candidate: secret });
      if (ok !== true) return json({ error: "権限がありません" }, 403);
      const { data: rows } = await admin.from("store_post_channels").select("store_id")
        .eq("platform", "x").eq("auto_post", true).is("paused_at", null);
      const storeIds = [...new Set((rows ?? []).map((r) => r.store_id as string))];
      const results = [];
      for (const storeId of storeIds) results.push(await processStore(storeId, now));
      console.log(JSON.stringify({ event: "x_auto_post", stores: storeIds.length, posted: results.reduce((n, r) => n + r.posted, 0) }));
      return json({ results });
    }

    const authorization = await signedInUser(req);
    if (!authorization) return json({ error: "ログインしてください" }, 401);

    if (input.action === "verify" && input.channel_id) {
      const { data: channel } = await admin.from("store_post_channels").select("id,store_id,platform").eq("id", input.channel_id).maybeSingle();
      if (!channel || channel.platform !== "x" || !(await canManage(authorization, channel.store_id))) return json({ error: "権限がありません" }, 403);
      const credentials = await credentialsFor(channel.id);
      if (!credentials) return json({ ok: false, error: "4つのキーがそろっていません" });
      const result = await verifyCredentials(credentials);
      const nowIso = new Date().toISOString();
      await admin.from("store_post_channels").update(result.ok
        ? { handle: `@${result.username}`, verified_at: nowIso, last_error: null, updated_at: nowIso }
        : { verified_at: null, last_error: result.error ?? "確認できませんでした", last_error_at: nowIso, updated_at: nowIso })
        .eq("id", channel.id);
      return json({ ok: result.ok, username: result.username ?? null, error: result.error ?? null });
    }

    if (input.action === "run" && input.store_id) {
      if (!(await canManage(authorization, input.store_id))) return json({ error: "権限がありません" }, 403);
      return json(await processStore(input.store_id, now));
    }
    return json({ error: "action が正しくありません" }, 400);
  } catch (error) {
    console.error("x-auto-post error:", error);
    return json({ error: "処理できませんでした" }, 500);
  }
});
