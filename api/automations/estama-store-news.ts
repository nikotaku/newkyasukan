import {
  assertStoreManager,
  authenticateUser,
  EstamaSubmissionUncertainError,
  getAdminClient,
  getConnection,
  LoginRequiredError,
} from "../../server/estama-automation.js";
import { postEstamaStoreNews } from "../../server/estama-store-news.js";

export const config = { maxDuration: 300 };

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

const articleIdFrom = (value: unknown) => typeof value === "string" ? value.trim() : "";

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const articleId = articleIdFrom(req.body?.articleId);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(articleId)) {
    res.status(400).json({ error: "記事IDを確認してください" });
    return;
  }

  let service: ReturnType<typeof getAdminClient> | null = null;
  let lockedArticleId: string | null = null;
  let lockedStoreId: string | null = null;
  try {
    const { admin, user } = await authenticateUser(req);
    const { data: article, error } = await admin
      .from("hp_articles")
      .select("id,store_id,title,content,image_urls,is_published,estama_status,estama_error,estama_attempts,estama_news_url")
      .eq("id", articleId)
      .maybeSingle();
    if (error) throw error;
    if (!article) {
      res.status(404).json({ error: "記事が見つかりません" });
      return;
    }
    await assertStoreManager(admin, user.id, article.store_id);
    if (!article.is_published) {
      res.status(422).json({ error: "公開済みの記事だけエステ魂へ投稿できます" });
      return;
    }
    if (article.estama_status === "posted") {
      res.status(200).json({ status: "posted", skipped: true, url: article.estama_news_url });
      return;
    }
    if (article.estama_status === "posting") {
      res.status(409).json({ error: "エステ魂への投稿処理中です" });
      return;
    }
    if (article.estama_error?.startsWith("【要確認・再送停止】")) {
      res.status(409).json({ error: article.estama_error, status: "review_required" });
      return;
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
      .eq("store_id", article.store_id)
      .eq("estama_status", article.estama_status || "pending")
      .select("id,store_id,title,content,image_urls")
      .maybeSingle();
    if (lockError) throw lockError;
    if (!locked) {
      res.status(409).json({ error: "別の投稿処理が開始されています" });
      return;
    }
    lockedArticleId = locked.id;
    lockedStoreId = locked.store_id;

    const connection = await getConnection(service, locked.store_id);
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

    res.status(200).json({ status: "posted", url: result.url, postedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const loginRequired = error instanceof LoginRequiredError;
    const uncertain = error instanceof EstamaSubmissionUncertainError;
    if (service && lockedArticleId) {
      await service.from("hp_articles").update({
        estama_status: loginRequired ? "pending" : "failed",
        estama_error: message,
      }).eq("id", lockedArticleId);
      if (loginRequired && lockedStoreId) {
        await service.from("automation_connections").update({
          status: "expired",
          last_error: message,
        }).eq("provider", "estama").eq("store_id", lockedStoreId);
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
    res.status(loginRequired ? 409 : uncertain ? 422 : 500).json({
      error: message,
      status: loginRequired ? "login_required" : uncertain ? "review_required" : "failed",
    });
  }
}
