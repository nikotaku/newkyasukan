// 画像の配信を軽くする共通関数。
//  - Supabase Storage の原本はそのまま（消さない・置き換えない）
//  - 表示するときは /api/img（Vercel の関数 + CDN）経由で、画面に合った幅に縮めた WebP/JPEG を読む
//  - 中継できない写真（Google Drive など）は今まで通り driveImgUrl の URL をそのまま使う
//  - 中継が失敗したときは StorageImage が原本に切り替える（写真が欠けることはない）
// Supabase の無料プランでは画像変換が使えないため、転送量（Cached Egress）を減らす目的。

import { driveImgUrl } from "./drive";

export type ImageVariant = "thumb" | "detail" | "hero";

/** 画面の用途ごとの横幅（これより大きい写真は縮めて配る） */
export const IMAGE_VARIANT_WIDTHS: Record<ImageVariant, number> = {
  thumb: 400, // 一覧のカード・管理画面のサムネイル
  detail: 1200, // キャスト詳細のメイン・トップのセラピストバナー
  hero: 1500, // トップのヒーローバナー
};

// 写真のファイル名は UUID で変わらない（加工すると別ファイルになる）ので、アップロードは1年キャッシュ
export const STORAGE_CACHE_CONTROL = "31536000";

const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/";
export const IMAGE_PROXY_PATH = "/api/img";

export interface StoragePublicUrl {
  origin: string;
  bucket: string;
  path: string;
}

/** 公開 URL が Supabase Storage のものなら、置き場所（バケット・パス）に分ける */
export function parseStoragePublicUrl(url: string | null | undefined): StoragePublicUrl | null {
  const value = (url || "").trim();
  if (!value.startsWith("http")) return null;
  const at = value.indexOf(STORAGE_PUBLIC_MARKER);
  if (at < 0) return null;
  const origin = value.slice(0, at);
  const rest = value.slice(at + STORAGE_PUBLIC_MARKER.length).split("?")[0];
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1));
  if (!path) return null;
  return { origin, bucket, path };
}

/** Supabase Storage の画像を、指定した幅で配る URL（Storage 以外は空文字） */
export function proxyImageUrl(url: string | null | undefined, width: number): string {
  if (!parseStoragePublicUrl(url)) return "";
  return `${IMAGE_PROXY_PATH}?u=${encodeURIComponent((url || "").trim().split("?")[0])}&w=${width}`;
}

/** 表示サイズ（px）から、配る幅を決める */
export function imageWidthForSize(size: number | undefined): number {
  if (!size || size <= 200) return 200;
  if (size <= 400) return 400;
  if (size <= 800) return 800;
  if (size <= 1200) return 1200;
  return 1500;
}

/** 派生画像 → 原本 の順に試すための URL の組（Google Drive の写真は今まで通り sz=w） */
export function imageUrlPair(url: string | null | undefined, variant: ImageVariant, size = 800) {
  const original = driveImgUrl(url, size);
  const proxied = proxyImageUrl(original, IMAGE_VARIANT_WIDTHS[variant] ?? imageWidthForSize(size));
  return { proxied, original };
}
