// 写真のアップロード（ブラウザの中だけで加工する）
//  - 大きすぎる写真は長辺2000pxのJPEGに軽くしてから上げる（PNGの数MBをそのまま置かない）
//  - キャッシュは1年（ファイル名は UUID で変わらないため）
//  - 表示は /api/img が画面に合った幅に縮めて配る（src/lib/storageImage.ts）
// 写真は端末の外へ出さない（canvas で描くだけ）。

import { supabase } from "@/integrations/supabase/client";
import { STORAGE_CACHE_CONTROL } from "./storageImage";

const IMAGE_TYPE_PATTERN = /^image\/(jpeg|jpg|png|webp)$/i;
// これより大きい写真は、置く前に軽くする
const COMPRESS_THRESHOLD_BYTES = 400 * 1024;
const ORIGINAL_LONG_EDGE = 2000;
const ORIGINAL_QUALITY = 0.9;

export interface UploadedImage {
  publicUrl: string;
  path: string;
}

function isImage(file: Blob): boolean {
  return IMAGE_TYPE_PATTERN.test(file.type || "");
}

function replaceExtension(path: string, ext: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  if (dot > slash) return `${path.slice(0, dot)}.${ext}`;
  return `${path}.${ext}`;
}

async function loadImage(blob: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
    };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("写真を読み込めませんでした"));
      element.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 長辺 longEdge に収まるように縮小した JPEG を作る（拡大はしない） */
export async function resizeToJpeg(blob: Blob, longEdge: number, quality: number): Promise<Blob> {
  const source = await loadImage(blob);
  const scale = Math.min(1, longEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("写真を加工できませんでした");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  source.draw(ctx, width, height);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!out) throw new Error("写真を加工できませんでした");
  return out;
}

/**
 * 写真を1枚 Storage に置く。大きい写真は軽くしてから、キャッシュ1年で置く。
 * 失敗したときは例外を投げる。
 */
export async function uploadImageWithVariants(
  bucket: string,
  file: File | Blob,
  path: string,
  options: {
    upsert?: boolean;
    contentType?: string;
    /** 置くファイルの長辺（省略時2000px）・画質（省略時0.9） */
    originalLongEdge?: number;
    originalQuality?: number;
    /** この大きさを超えたら軽くする（省略時400KB） */
    compressAboveBytes?: number;
  } = {},
): Promise<UploadedImage> {
  const longEdgeLimit = options.originalLongEdge ?? ORIGINAL_LONG_EDGE;
  const quality = options.originalQuality ?? ORIGINAL_QUALITY;
  let body: Blob = file;
  let targetPath = path;
  let contentType = options.contentType || file.type || "application/octet-stream";

  if (isImage(file) && file.size > (options.compressAboveBytes ?? COMPRESS_THRESHOLD_BYTES)) {
    try {
      const source = await loadImage(file);
      const needsResize = Math.max(source.width, source.height) > longEdgeLimit;
      const compressed = await resizeToJpeg(file, longEdgeLimit, quality);
      // 軽くならないときは元のファイルのまま置く
      if (compressed.size < file.size) {
        body = compressed;
        contentType = "image/jpeg";
        if (needsResize || !/\.jpe?g$/i.test(targetPath)) targetPath = replaceExtension(targetPath, "jpg");
      }
    } catch (error) {
      console.warn("写真を軽くできなかったため、元のファイルを置きます", error);
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(targetPath, body, { cacheControl: STORAGE_CACHE_CONTROL, contentType, upsert: options.upsert ?? false });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(targetPath);
  return { publicUrl, path: targetPath };
}
