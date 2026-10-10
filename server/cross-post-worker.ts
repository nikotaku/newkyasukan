import { getAdminClient } from "./estama-automation.js";
import { isRetryableCrossPost } from "./cross-post-reconcile-utils.js";

type AdminClient = ReturnType<typeof getAdminClient>;
type PublishStoreNews = (
  admin: AdminClient,
  storeId: string,
  articleId: string,
) => Promise<{ statusCode: number; body: unknown }>;

type CastPost = {
  id: string;
  cast_id: string;
  store_id: string;
  o2_status: string | null;
  o2_error: string | null;
  o2_attempts: number | null;
  esutama_status: string | null;
  esutama_error: string | null;
  esutama_attempts: number | null;
};

const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || "https://imrxzkivwrkqbhqfbbes.supabase.co";

async function claimToken(admin: AdminClient, token: string) {
  if (token.length < 48) return false;
  const { data, error } = await admin.rpc("claim_cross_post_worker_token", { p_token: token });
  if (error) throw new Error(`同時投稿トークンを確認できませんでした: ${error.message}`);
  return data === true;
}

async function invokeCastPost(postId: string, accessToken: string, target: "o2" | "esutama") {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/post-to-sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId, access_token: accessToken, target }),
    signal: AbortSignal.timeout(target === "esutama" ? 180_000 : 75_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const results = payload.results && typeof payload.results === "object"
    ? payload.results as Record<string, unknown>
    : {};
  const o2 = results.o2 && typeof results.o2 === "object"
    ? results.o2 as Record<string, unknown>
    : {};
  const status = target === "o2" ? stringValue(o2.status) : stringValue(payload.status);
  return {
    target,
    ok: response.ok,
    status: status || (response.ok ? "posted" : "failed"),
    error: stringValue(payload.error) || stringValue(o2.error) || null,
  };
}

async function processOldestCastPost(admin: AdminClient) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const [{ data, error }, { data: readyConnections, error: connectionError }] = await Promise.all([
    admin.from("cast_posts")
      .select("id,cast_id,store_id,o2_status,o2_error,o2_attempts,esutama_status,esutama_error,esutama_attempts")
      .gte("created_at", cutoff)
      .or("o2_status.in.(pending,failed),esutama_status.in.(pending,failed,skipped)")
      .order("created_at", { ascending: true })
      .limit(50),
    admin.from("automation_connections")
      .select("store_id")
      .eq("provider", "estama")
      .eq("status", "ready")
      .not("browserbase_context_id", "is", null),
  ]);
  if (error) throw error;
  if (connectionError) throw connectionError;
  const readyStoreIds = new Set((readyConnections || []).map((connection) => connection.store_id));

  const post = ((data || []) as CastPost[]).find((candidate) =>
    isRetryableCrossPost(candidate.o2_status, candidate.o2_error, candidate.o2_attempts)
    || (readyStoreIds.has(candidate.store_id)
      && isRetryableCrossPost(candidate.esutama_status, candidate.esutama_error, candidate.esutama_attempts, 3, true))
  );
  if (!post) return null;

  const { data: cast, error: castError } = await admin.from("casts")
    .select("access_token,is_active")
    .eq("id", post.cast_id)
    .eq("store_id", post.store_id)
    .maybeSingle();
  if (castError) throw castError;
  const accessToken = stringValue(cast?.access_token);
  if (!cast?.is_active || !accessToken) {
    const message = cast?.is_active === false
      ? "アーカイブ済みのセラピストには投稿できません"
      : "セラピストの投稿トークンがありません";
    const update: Record<string, unknown> = { status: "failed" };
    if (isRetryableCrossPost(post.o2_status, post.o2_error, post.o2_attempts)) {
      update.o2_status = "failed";
      update.o2_error = message;
      update.o2_attempts = 3;
    }
    if (readyStoreIds.has(post.store_id)
      && isRetryableCrossPost(post.esutama_status, post.esutama_error, post.esutama_attempts, 3, true)) {
      update.esutama_status = "failed";
      update.esutama_error = message;
      update.esutama_attempts = 3;
    }
    await admin.from("cast_posts").update(update).eq("id", post.id);
    return { kind: "cast-post", id: post.id, results: [], error: message };
  }

  const targets: Array<"o2" | "esutama"> = [];
  if (isRetryableCrossPost(post.o2_status, post.o2_error, post.o2_attempts)) targets.push("o2");
  if (readyStoreIds.has(post.store_id)
    && isRetryableCrossPost(post.esutama_status, post.esutama_error, post.esutama_attempts, 3, true)) targets.push("esutama");
  const results = await Promise.all(targets.map((target) => invokeCastPost(post.id, accessToken, target)));
  return { kind: "cast-post", id: post.id, results };
}

async function processOldestStoreNews(admin: AdminClient, publishStoreNews: PublishStoreNews) {
  const { data, error } = await admin.from("hp_articles")
    .select("id,store_id,estama_status,estama_error,estama_attempts")
    .eq("is_published", true)
    .gte("created_at", "2026-10-08T12:50:00.000Z")
    .in("estama_status", ["pending", "failed"])
    .lt("estama_attempts", 3)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  const article = (data || []).find((candidate) =>
    isRetryableCrossPost(candidate.estama_status, candidate.estama_error, candidate.estama_attempts)
  );
  if (!article) return null;
  const result = await publishStoreNews(admin, article.store_id, article.id);
  return { kind: "store-news", id: article.id, statusCode: result.statusCode, result: result.body };
}

export async function runCrossPostWorker(token: string, publishStoreNews: PublishStoreNews) {
  let admin: AdminClient | null = null;
  let claimed = false;
  try {
    admin = getAdminClient();
    claimed = await claimToken(admin, token);
    if (!claimed) {
      return { statusCode: 401, body: { error: "同時投稿トークンが無効または使用済みです" } };
    }

    // 魂セラピストと店舗ニュースは同じエステ魂ブラウザを使うため、1回につき片方だけ処理する。
    const castPost = await processOldestCastPost(admin);
    const storeNews = castPost ? null : await processOldestStoreNews(admin, publishStoreNews);
    return { statusCode: 200, body: { ok: true, processed: castPost || storeNews } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "cross_post_worker_failed", error: message }));
    return { statusCode: 500, body: { error: message } };
  } finally {
    if (admin && claimed && token) {
      const { error } = await admin.rpc("release_cross_post_worker_lease", { p_token: token });
      if (error) console.error(JSON.stringify({ event: "cross_post_worker_lease_release_failed", error: error.message }));
    }
  }
}
