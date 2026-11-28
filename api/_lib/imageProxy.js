// 画像の配信を軽くする中継（Vercel の関数 + CDN キャッシュ）
// Hobby プランは Deployment あたり12関数までなので、専用の関数を作らず sitemap の関数で受ける
// （vercel.json の rewrite: /api/img → /api/sitemap?image=1）
//
// なぜ必要か：Supabase の無料プランでは画像変換（/render/image）が使えず、Storage の原本
// （平均 500KB・最大 2.4MB）がそのまま HP に出ていた。Cached Egress が 5.5GB を超える原因。
// ここで表示に必要な幅に縮めて WebP/JPEG で返し、Vercel の CDN に1年キャッシュさせる。
//  - 原本は Storage にそのまま残す（消さない・置き換えない）
//  - 対象は自プロジェクトの Storage の公開 URL だけ（それ以外の URL は中継しない）
//  - 中継できないとき・縮小に失敗したときは、元の URL へそのまま転送する（画像が消えない）

import sharp from "sharp";

const SUPABASE_HOST = "imrxzkivwrkqbhqfbbes.supabase.co";
const STORAGE_PATH_PREFIX = "/storage/v1/object/public/";
// この幅だけ受け付ける（呼び出し側は画面の大きさに合わせて w= を付ける）
const ALLOWED_WIDTHS = new Set([100, 150, 200, 300, 400, 600, 800, 1000, 1200, 1500, 2000]);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const CACHE_HEADER = "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable";

const redirectToSource = (res, source) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Location", source);
  res.status(302).end();
};

const parseSource = (value) => {
  if (typeof value !== "string" || value.length > 2000) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== SUPABASE_HOST) return null;
  if (!url.pathname.startsWith(STORAGE_PATH_PREFIX)) return null;
  return url;
};

const parseWidth = (value) => {
  const width = Number.parseInt(String(value ?? ""), 10);
  return ALLOWED_WIDTHS.has(width) ? width : 800;
};

const parseQuality = (value) => {
  const quality = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(quality)) return null;
  return Math.min(90, Math.max(45, quality));
};

export default async function handleImage(req, res) {
  const source = parseSource(req.query?.u);
  if (!source) {
    res.status(400).json({ error: "u must be a public storage URL of this project" });
    return;
  }

  const width = parseWidth(req.query?.w);
  const quality = parseQuality(req.query?.q);
  const accepts = String(req.headers?.accept || "");

  let upstream;
  try {
    upstream = await fetch(source.toString(), {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    redirectToSource(res, source.toString());
    return;
  }

  if (!upstream.ok) {
    redirectToSource(res, source.toString());
    return;
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!/^image\/(jpeg|jpg|png|webp|avif)\b/i.test(contentType)) {
    redirectToSource(res, source.toString());
    return;
  }
  const declaredLength = Number(upstream.headers.get("content-length") || "0");
  if (declaredLength > MAX_SOURCE_BYTES) {
    redirectToSource(res, source.toString());
    return;
  }

  let input;
  try {
    input = Buffer.from(await upstream.arrayBuffer());
  } catch {
    redirectToSource(res, source.toString());
    return;
  }
  if (input.byteLength > MAX_SOURCE_BYTES) {
    redirectToSource(res, source.toString());
    return;
  }

  // 横幅の上限。拡大はしない（小さい写真は元の大きさのまま）
  const pipeline = sharp(input, { failOn: "none", animated: false })
    .rotate()
    .resize({ width, withoutEnlargement: true, fit: "inside" });

  const useWebp = /\bimage\/webp\b/i.test(accepts);
  const output = useWebp
    ? await pipeline.webp({ quality: quality ?? 78, effort: 4 }).toBuffer()
    : await pipeline.jpeg({ quality: quality ?? 82, mozjpeg: true, progressive: true }).toBuffer();

  // 縮小した結果の方が大きいときは元の画像を返す（無駄な変換をしない）
  if (!output || output.byteLength >= input.byteLength) {
    res.setHeader("Cache-Control", CACHE_HEADER);
    res.setHeader("Content-Type", contentType);
    res.status(200).send(input);
    return;
  }

  res.setHeader("Cache-Control", CACHE_HEADER);
  res.setHeader("Content-Type", useWebp ? "image/webp" : "image/jpeg");
  res.setHeader("Vary", "Accept");
  res.setHeader("X-Original-Length", String(input.byteLength));
  res.status(200).send(output);
}
