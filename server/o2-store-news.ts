import type { SupabaseClient } from "@supabase/supabase-js";
import { buildO2NewsBody, pickO2NewsImage } from "../src/lib/hpArticleO2.js";
import { O2_STORE_LOGIN_URL, O2StoreReviewRequiredError, postToO2Store } from "./o2-store-availability.js";

// HPのニュース（hp_articles）を、空き状況の投稿と同じO2の店舗アカウントへ出す。
// 結果は hp_articles.o2_status（pending → posting → posted / failed / review_required / skipped）に残す。
const REVIEW_REQUIRED_PREFIX = "【要確認・再送停止】";

type Result = { statusCode: number; body: Record<string, unknown> };

export async function publishStoreNewsToO2(service: SupabaseClient, storeId: string, articleId: string): Promise<Result> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(articleId)) {
    return { statusCode: 400, body: { error: "記事IDを確認してください" } };
  }
  const { data: article, error } = await service
    .from("hp_articles")
    .select("id,store_id,title,content,image_urls,is_published,post_to_o2,o2_status,o2_error,o2_attempts,o2_post_url")
    .eq("id", articleId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!article) return { statusCode: 404, body: { error: "記事が見つかりません" } };
  if (!article.is_published) return { statusCode: 422, body: { error: "公開済みの記事だけO2へ投稿できます" } };
  if (!article.post_to_o2) return { statusCode: 200, body: { status: "skipped", skipped: true } };
  if (article.o2_status === "posted") return { statusCode: 200, body: { status: "posted", skipped: true, url: article.o2_post_url } };
  if (article.o2_status === "posting") return { statusCode: 409, body: { error: "O2への投稿処理中です" } };
  if (article.o2_status === "review_required") {
    return { statusCode: 409, body: { error: article.o2_error || "O2の掲載結果を確認してください", status: "review_required" } };
  }

  const { data: locked, error: lockError } = await service
    .from("hp_articles")
    .update({ o2_status: "posting", o2_error: null, o2_attempts: Number(article.o2_attempts || 0) + 1 })
    .eq("id", article.id)
    .eq("o2_status", article.o2_status || "pending")
    .select("id")
    .maybeSingle();
  if (lockError) throw lockError;
  if (!locked) return { statusCode: 409, body: { error: "別の投稿処理が開始されています" } };

  const finish = (patch: Record<string, unknown>) =>
    service.from("hp_articles").update(patch).eq("id", article.id).eq("o2_status", "posting");

  try {
    const [{ data: credential, error: credentialError }, { data: store, error: storeError }] = await Promise.all([
      service.from("store_site_credentials").select("login_id,password,login_url").eq("store_id", storeId).eq("site", "o2").maybeSingle(),
      service.from("stores").select("custom_domain,logo_url,settings").eq("id", storeId).maybeSingle(),
    ]);
    if (credentialError) throw credentialError;
    if (storeError) throw storeError;
    if (!credential?.login_id || !credential.password || credential.login_url !== O2_STORE_LOGIN_URL) {
      const reason = "O2店舗ログイン情報が未設定です（SNS連携管理の「O2店舗アカウント」で登録してください）";
      await finish({ o2_status: "failed", o2_error: reason });
      return { statusCode: 409, body: { error: reason, status: "failed" } };
    }

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const heroBanners = Array.isArray(settings.hero_banners) ? settings.hero_banners : [];
    const imageUrl = pickO2NewsImage(article.image_urls, [settings.o2_news_image, store?.logo_url, ...heroBanners]);
    if (!imageUrl) {
      const reason = "O2に付ける画像がありません（記事に画像を入れるか、HPのトップバナーを登録してください）";
      await finish({ o2_status: "failed", o2_error: reason });
      return { statusCode: 422, body: { error: reason, status: "failed" } };
    }

    const domain = String(store?.custom_domain || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const body = buildO2NewsBody(article.title, article.content, domain ? `https://${domain}/` : null);
    const result = await postToO2Store(credential.login_id, credential.password, body, imageUrl);
    const postedAt = new Date().toISOString();
    const { error: saveError } = await finish({ o2_status: "posted", o2_error: null, o2_posted_at: postedAt, o2_post_url: result.url });
    if (saveError) {
      throw new O2StoreReviewRequiredError("O2店舗への公開後、投稿結果を保存できませんでした", { id: result.postId, url: result.url });
    }
    return { statusCode: 200, body: { status: "posted", url: result.url, postedAt } };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const reviewRequired = message.startsWith(REVIEW_REQUIRED_PREFIX);
    await finish({
      o2_status: reviewRequired ? "review_required" : "failed",
      o2_error: message.slice(0, 2000),
      ...(caught instanceof O2StoreReviewRequiredError && caught.postUrl ? { o2_post_url: caught.postUrl } : {}),
    });
    console.warn(JSON.stringify({ level: "warn", msg: "o2_store_news_failed", articleId, reviewRequired, error: message }));
    return { statusCode: reviewRequired ? 409 : 500, body: { error: message, status: reviewRequired ? "review_required" : "failed" } };
  }
}
