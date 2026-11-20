// 本人のXの投稿を、店長アカウント（店舗の投稿先の X・店長）のキーで X API から読み、cast_x_posts に入れる。
// 露出ノルマの「本人投稿 › 本人X」と、企画の本人のX投稿タスクの自動チェック（promotion_task_evidence の self_x）に使う。
//  - { action: "run" } … pg_cron（毎時19分・x-auto-post-secret）。キーがそろい、間隔が過ぎた店舗だけ
//  - { action: "run", store_id } … 画面の「今すぐ読む」（ログイン中の店長・オーナー。間隔は無視）
// 読むのは casts.x_account のある在籍中の人だけ。リポスト・返信は読まない。キーやプランの問題なら12時間あけて読み直す。

import { createClient } from "npm:@supabase/supabase-js@2";
import { lookupUsers, tweetUrl, userTweets, type XCredentials } from "../_shared/xApi.ts";
import { normalizeXHandle } from "../../../server/estama-sns-links.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BLOCK_HOURS = 12;

/** 初めて読む人は、今月の1日（日本時間）から */
function monthStartIso(now = new Date()) {
  const tokyo = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), 1) - 9 * 3600_000).toISOString();
}

async function credentialsFor(storeId: string): Promise<XCredentials | null> {
  const { data: channel } = await admin.from("store_post_channels").select("id")
    .eq("store_id", storeId).eq("platform", "x").eq("account_key", "tencho").maybeSingle();
  if (!channel) return null;
  const { data } = await admin.rpc("get_store_post_channel_secrets", { p_channel_id: channel.id });
  const s = (data ?? {}) as Record<string, string>;
  if (!s.api_key || !s.api_secret || !s.access_token || !s.access_token_secret) return null;
  return { apiKey: s.api_key, apiSecret: s.api_secret, accessToken: s.access_token, accessTokenSecret: s.access_token_secret };
}

async function setStatus(storeId: string, values: Record<string, unknown>) {
  await admin.from("cast_x_read_status").upsert({ store_id: storeId, ...values, updated_at: new Date().toISOString() }, { onConflict: "store_id" });
}

async function processStore(storeId: string) {
  const startedAt = new Date().toISOString();
  const credentials = await credentialsFor(storeId);
  if (!credentials) {
    await setStatus(storeId, { last_run_at: startedAt, last_error: "店長アカウントのXのキー（4つ）が登録されていません", last_error_at: startedAt });
    return { store: storeId, read: 0, error: "no_credentials" };
  }
  await setStatus(storeId, { last_run_at: startedAt });

  const { data: casts } = await admin.from("casts").select("id,x_account").eq("store_id", storeId).eq("is_active", true).not("x_account", "is", null);
  const { data: accounts } = await admin.from("cast_x_accounts").select("cast_id,username,x_user_id,since_id").eq("store_id", storeId);
  const known = new Map((accounts ?? []).map((row) => [row.cast_id as string, row]));

  const targets = (casts ?? [])
    .map((cast) => ({ castId: cast.id as string, username: normalizeXHandle(cast.x_account as string) }))
    .filter((cast) => cast.username);

  // IDが変わった・まだ数字のIDが無い人をまとめて引く
  const needLookup = targets.filter((t) => {
    const row = known.get(t.castId);
    return !row?.x_user_id || String(row.username).toLowerCase() !== t.username.toLowerCase();
  });
  let fatal: { error: string; needsAttention: boolean } | null = null;
  if (needLookup.length > 0) {
    const result = await lookupUsers(credentials, needLookup.map((t) => t.username));
    if (!result.ok) {
      fatal = { error: result.error ?? "Xのアカウントを確認できませんでした", needsAttention: !!result.needsAttention };
    } else {
      const byName = new Map(result.users.map((u) => [u.username.toLowerCase(), u.id]));
      for (const t of needLookup) {
        const id = byName.get(t.username.toLowerCase()) ?? null;
        const before = known.get(t.castId);
        const row = {
          cast_id: t.castId,
          store_id: storeId,
          username: t.username,
          x_user_id: id,
          since_id: before && before.x_user_id === id ? before.since_id : null,
          last_error: id ? null : "Xにこのアカウントが見つかりません",
          updated_at: new Date().toISOString(),
        };
        await admin.from("cast_x_accounts").upsert(row, { onConflict: "cast_id" });
        known.set(t.castId, row);
      }
    }
  }

  let readCount = 0;
  if (!fatal) {
    for (const t of targets) {
      const row = known.get(t.castId);
      if (!row?.x_user_id) continue;
      const result = await userTweets(credentials, row.x_user_id as string, { sinceId: row.since_id as string | null, startTime: monthStartIso() });
      const nowIso = new Date().toISOString();
      if (!result.ok) {
        await admin.from("cast_x_accounts").update({ last_checked_at: nowIso, last_error: result.error ?? "読み取れませんでした", updated_at: nowIso }).eq("cast_id", t.castId);
        if (result.needsAttention || result.status === 429) {
          fatal = { error: result.error ?? "読み取れませんでした", needsAttention: !!result.needsAttention };
          break;
        }
        continue;
      }
      if (result.tweets.length > 0) {
        const rows = result.tweets.map((tweet) => ({
          store_id: storeId,
          cast_id: t.castId,
          tweet_id: tweet.id,
          text: tweet.text,
          posted_at: tweet.created_at,
          url: tweetUrl(t.username, tweet.id),
          is_reply: (tweet.referenced_tweets ?? []).some((r) => r.type === "replied_to"),
          is_retweet: (tweet.referenced_tweets ?? []).some((r) => r.type === "retweeted"),
          fetched_at: nowIso,
        }));
        await admin.from("cast_x_posts").upsert(rows, { onConflict: "tweet_id", ignoreDuplicates: true });
        readCount += rows.length;
      }
      // X のIDは数字の文字列。新しい順に来るので、いちばん大きいものを次の since_id にする
      const newest = result.tweets.map((tw) => tw.id).sort((a, b) => (a.length - b.length) || a.localeCompare(b)).pop();
      await admin.from("cast_x_accounts").update({
        last_checked_at: nowIso,
        last_error: null,
        ...(newest ? { since_id: newest } : {}),
        updated_at: nowIso,
      }).eq("cast_id", t.castId);
    }
  }

  const finishedAt = new Date().toISOString();
  if (fatal) {
    await setStatus(storeId, {
      last_error: fatal.error,
      last_error_at: finishedAt,
      last_read_count: readCount,
      blocked_until: fatal.needsAttention ? new Date(Date.now() + BLOCK_HOURS * 3600_000).toISOString() : null,
    });
    return { store: storeId, read: readCount, error: fatal.error };
  }
  await setStatus(storeId, { last_ok_at: finishedAt, last_error: null, blocked_until: null, last_read_count: readCount });
  // 読んだ投稿で、企画の本人のX投稿タスクに✓を付ける
  if (readCount > 0) await admin.rpc("run_promotion_task_autocheck_service", { p_store_id: storeId });
  return { store: storeId, read: readCount, accounts: targets.length };
}

async function signedInUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? authorization : null;
}

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
    const input = await req.json().catch(() => ({})) as { action?: string; store_id?: string };
    const secret = req.headers.get("x-auto-post-secret");
    if (secret) {
      const { data: ok } = await admin.rpc("verify_x_auto_post_secret", { candidate: secret });
      if (ok !== true) return json({ error: "権限がありません" }, 403);
      const { data: storeIds } = await admin.rpc("cast_x_read_due_stores");
      const results = [];
      for (const storeId of (storeIds ?? []) as string[]) results.push(await processStore(storeId));
      console.log(JSON.stringify({ event: "x_cast_posts", stores: results.length, read: results.reduce((n, r) => n + r.read, 0) }));
      return json({ results });
    }
    const authorization = await signedInUser(req);
    if (!authorization) return json({ error: "ログインしてください" }, 401);
    if (input.action === "run" && input.store_id) {
      if (!(await canManage(authorization, input.store_id))) return json({ error: "権限がありません" }, 403);
      return json(await processStore(input.store_id));
    }
    return json({ error: "action が正しくありません" }, 400);
  } catch (error) {
    console.error("x-cast-posts error:", error);
    return json({ error: "処理できませんでした" }, 500);
  }
});
