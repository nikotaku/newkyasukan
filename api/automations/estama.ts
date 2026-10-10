import {
  assertStoreManager,
  authenticateUser,
  enqueueCastJob,
  EstamaSubmissionUncertainError,
  getAdminClient,
  getConnection,
  LoginRequiredError,
  processAvailableJobs,
  startLoginSetup,
  verifyLoginSetup,
} from "../../server/estama-automation.js";
import { waitUntil } from "@vercel/functions";
import { describeError } from "../../server/estama-error.js";
import { processO2StoreAvailabilityPost } from "../../server/o2-store-availability.js";
import { postEstamaStoreNews } from "../../server/estama-store-news.js";
import { runCrossPostWorker } from "../../server/cross-post-worker.js";

export const config = { maxDuration: 300 };

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};
type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

const stringValue = (value: unknown) => typeof value === "string" ? value : "";

export async function publishStoreNews(
  admin: Awaited<ReturnType<typeof authenticateUser>>["admin"],
  storeId: string,
  articleId: string,
) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(articleId)) {
    return { statusCode: 400, body: { error: "記事IDを確認してください" } };
  }

  let service: ReturnType<typeof getAdminClient> | null = null;
  let lockedArticleId: string | null = null;
  try {
    const { data: article, error } = await admin
      .from("hp_articles")
      .select("id,store_id,title,content,image_urls,is_published,estama_status,estama_error,estama_attempts,estama_news_url")
      .eq("id", articleId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    if (!article) return { statusCode: 404, body: { error: "記事が見つかりません" } };
    if (!article.is_published) {
      return { statusCode: 422, body: { error: "公開済みの記事だけエステ魂へ投稿できます" } };
    }
    if (article.estama_status === "posted") {
      return { statusCode: 200, body: { status: "posted", skipped: true, url: article.estama_news_url } };
    }
    if (article.estama_status === "posting") {
      return { statusCode: 409, body: { error: "エステ魂への投稿処理中です" } };
    }
    if (article.estama_error?.startsWith("【要確認・再送停止】")) {
      return { statusCode: 409, body: { error: article.estama_error, status: "review_required" } };
    }

    service = getAdminClient();
    const { data: locked, error: lockError } = await service
      .from("hp_articles")
      .update({
        estama_status: "posting",
        estama_error: null,
        estama_attempts: (article.estama_attempts || 0) + 1,
      })
      .eq("id", article.id)
      .eq("store_id", storeId)
      .eq("estama_status", article.estama_status || "pending")
      .select("id,store_id,title,content,image_urls")
      .maybeSingle();
    if (lockError) throw lockError;
    if (!locked) return { statusCode: 409, body: { error: "別の投稿処理が開始されています" } };
    lockedArticleId = locked.id;

    const connection = await getConnection(service, storeId);
    if (!connection) throw new LoginRequiredError("エステ魂の連携設定がありません");
    const result = await postEstamaStoreNews(service, connection, locked);
    const postedAt = new Date().toISOString();
    const { error: updateError } = await service.from("hp_articles").update({
      estama_status: "posted",
      estama_error: null,
      estama_posted_at: postedAt,
      estama_news_url: result.url,
    }).eq("id", locked.id);
    if (updateError) {
      throw new EstamaSubmissionUncertainError(
        "エステ魂への掲載は確認できましたが、HP側の完了記録に失敗しました",
      );
    }
    return { statusCode: 200, body: { status: "posted", url: result.url, postedAt } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const loginRequired = error instanceof LoginRequiredError;
    const uncertain = error instanceof EstamaSubmissionUncertainError;
    if (service && lockedArticleId) {
      await service.from("hp_articles").update({
        estama_status: loginRequired ? "pending" : "failed",
        estama_error: message,
      }).eq("id", lockedArticleId);
      if (loginRequired) {
        await service.from("automation_connections").update({
          status: "expired",
          last_error: message,
        }).eq("provider", "estama").eq("store_id", storeId);
      }
    }
    console.warn(JSON.stringify({
      level: "warn",
      msg: "estama_store_news_failed",
      articleId,
      loginRequired,
      uncertain,
      error: message,
    }));
    return {
      statusCode: loginRequired ? 409 : uncertain ? 422 : 500,
      body: {
        error: message,
        status: loginRequired ? "login_required" : uncertain ? "review_required" : "failed",
      },
    };
  }
}

// レスポンスを返した後も、関数の時間内（maxDuration）は処理を続ける。画面を閉じても・通信が切れても止まらない
function runInBackground(event: string, work: Promise<Array<{ id: string; status: string }>>) {
  waitUntil(work.then((results) => {
    console.log(JSON.stringify({ event: `${event}_finished`, results: results.map((result) => `${result.id}:${result.status}`) }));
  }).catch((error) => {
    console.error(JSON.stringify({ event: `${event}_failed`, error: describeError(error) }));
  }));
}

// 毎時40分の空き枠更新が同じエステ魂のログインを使うので、その前後（27〜42分）はバックグラウンドの反映を始めない
const inQuietWindow = () => {
  const minute = new Date().getUTCMinutes();
  return minute >= 27 && minute <= 42;
};

// 関数の時間切れなどで「実行中」のまま止まったプロフィール同期を、もう一度実行できるように戻す
async function requeueStaleProfileJobs(admin: Awaited<ReturnType<typeof authenticateUser>>["admin"], storeId: string) {
  const { error } = await admin.from("automation_jobs").update({
    status: "queued",
    available_at: new Date().toISOString(),
    started_at: null,
    error_message: "前回のプロフィール同期が中断されたため自動再開しました",
  })
    .eq("store_id", storeId)
    .eq("provider", "estama")
    .eq("job_type", "estama_register_cast")
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 7 * 60_000).toISOString());
  if (error) console.warn(JSON.stringify({ event: "estama_requeue_stale_failed", error: error.message }));
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const source = req.method === "GET" ? req.query || {} : req.body || {};
  if (req.method === "POST" && stringValue(source.action) === "cross-post-worker") {
    const result = await runCrossPostWorker(stringValue(source.token).trim(), publishStoreNews);
    res.status(result.statusCode).json(result.body);
    return;
  }
  const isO2StoreAvailabilityRequest = req.query?.action === "o2-store-availability";
  if (isO2StoreAvailabilityRequest && req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { admin, user } = await authenticateUser(req);
    const storeId = stringValue(source.storeId);
    if (!storeId) throw new Error("storeId が必要です");
    await assertStoreManager(admin, user.id, storeId);

    if (isO2StoreAvailabilityRequest) {
      const result = await processO2StoreAvailabilityPost(admin, storeId, { triggerSource: "manual" });
      const statusCode = result.status === "failed" ? 500 : result.status === "review_required" ? 409 : 200;
      res.status(statusCode).json(result);
      return;
    }

    const action = stringValue(source.action);
    if (action === "store-news") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.status(405).json({ error: "Method not allowed" });
        return;
      }
      const result = await publishStoreNews(admin, storeId, stringValue(source.articleId).trim());
      res.status(result.statusCode).json(result.body);
      return;
    }

    if (req.method === "GET") {
      const [connection, jobsResult] = await Promise.all([
        getConnection(admin, storeId),
        admin.from("automation_jobs")
          .select("id,job_type,status,cast_id,error_message,created_at,available_at,started_at,finished_at,skipped:result->skipped,skip_message:result->>message")
          .eq("store_id", storeId).eq("provider", "estama").order("created_at", { ascending: false }).limit(50),
      ]);
      res.status(200).json({ connection, jobs: jobsResult.data || [] });
      return;
    }

    if (action === "setup") {
      const result = await startLoginSetup(admin, storeId);
      res.status(200).json(result);
      return;
    }
    if (action === "verify") {
      const connection = await verifyLoginSetup(admin, storeId);
      res.status(200).json({ connection });
      return;
    }
    if (action === "run-cast") {
      const castId = stringValue(source.castId);
      if (!castId) throw new Error("castId が必要です");
      const { data: cast } = await admin.from("casts").select("id,store_id").eq("id", castId).eq("store_id", storeId).eq("is_active", true).maybeSingle();
      if (!cast) throw new Error("対象セラピストが見つかりません");
      const jobId = await enqueueCastJob(admin, storeId, castId);
      if (source.background === true) {
        // 画面を閉じても・通信が切れても最後まで処理する（レスポンス後も関数を maxDuration まで生かす）
        waitUntil(processAvailableJobs(admin, { jobId, limit: 1 }).then((results) => {
          console.log(JSON.stringify({ event: "estama_run_cast_background_finished", jobId, status: results[0]?.status || "none" }));
        }).catch((error) => {
          console.error(JSON.stringify({ event: "estama_run_cast_background_failed", jobId, error: describeError(error) }));
        }));
        res.status(202).json({ jobId, queued: true, results: [] });
        return;
      }
      const results = await processAvailableJobs(admin, { jobId, limit: 1 });
      res.status(200).json({ results });
      return;
    }
    if (action === "run-profile-sync") {
      const castId = stringValue(source.castId);
      if (!castId) throw new Error("castId が必要です");
      const [{ data: cast }, { data: profile }] = await Promise.all([
        admin.from("casts").select("id,store_id").eq("id", castId).eq("store_id", storeId).eq("is_active", true).maybeSingle(),
        admin.from("external_cast_profiles").select("sync_status").eq("cast_id", castId).eq("provider", "estama").maybeSingle(),
      ]);
      if (!cast) throw new Error("対象セラピストが見つかりません");
      if (profile?.sync_status !== "synced") {
        res.status(200).json({ results: [], skipped: true, reason: "profile_not_linked" });
        return;
      }
      const { data: activeJob } = await admin.from("automation_jobs")
        .select("id,status")
        .eq("store_id", storeId)
        .eq("provider", "estama")
        .eq("job_type", "estama_register_cast")
        .eq("cast_id", castId)
        .in("status", ["queued", "running", "waiting_for_login"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeJob?.status === "running") {
        res.status(200).json({ results: [], skipped: true, reason: "already_running" });
        return;
      }
      const jobId = activeJob?.status === "queued"
        ? activeJob.id
        : await enqueueCastJob(admin, storeId, castId, "profile_update");
      if (source.background === true) {
        if (inQuietWindow()) {
          // 反映待ちに積んだまま。42分を過ぎたら管理画面の左下のお知らせが自動で反映を始める
          res.status(202).json({ jobId, queued: false, reason: "quiet_window", results: [] });
          return;
        }
        runInBackground("estama_profile_sync_background", processAvailableJobs(admin, { jobId, limit: 1 }));
        res.status(202).json({ jobId, queued: true, results: [] });
        return;
      }
      const results = await processAvailableJobs(admin, { jobId, limit: 1 });
      res.status(200).json({ results });
      return;
    }
    if (action === "run-queued") {
      const jobType = source.jobType === "estama_register_cast" ? "estama_register_cast" : undefined;
      if (source.background === true) {
        // プロフィールの反映待ちを、画面を閉じても最後まで反映する（管理画面の左下のお知らせから自動で呼ぶ）
        if (inQuietWindow()) {
          res.status(202).json({ queued: false, skipped: true, reason: "quiet_window", results: [] });
          return;
        }
        await requeueStaleProfileJobs(admin, storeId);
        const { data: running } = await admin.from("automation_jobs")
          .select("id")
          .eq("store_id", storeId)
          .eq("provider", "estama")
          .eq("job_type", "estama_register_cast")
          .eq("status", "running")
          .limit(1)
          .maybeSingle();
        if (running) {
          res.status(202).json({ queued: false, skipped: true, reason: "already_running", results: [] });
          return;
        }
        // 1件1〜2分かかるので、関数の時間内（5分）に終わる件数だけ。残りは次の呼び出しで続ける
        runInBackground("estama_run_queued_background", processAvailableJobs(admin, { storeId, jobType, limit: 2 }));
        res.status(202).json({ queued: true, results: [] });
        return;
      }
      const results = await processAvailableJobs(admin, { storeId, jobType, limit: Number(source.limit) || 20 });
      res.status(200).json({ results });
      return;
    }
    throw new Error("未対応の操作です");
  } catch (error) {
    const message = describeError(error);
    const unauthorized = /認証|ログインが期限切れ/.test(message);
    const forbidden = /権限/.test(message);
    res.status(unauthorized ? 401 : forbidden ? 403 : 400).json({ error: message });
  }
}
