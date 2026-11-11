export const LINE_MEDIA_BUCKET = "line-customer-media";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 拡張子や申告MIMEだけを信用せず、実データを確認する。 */
export function imageContentType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

export function decodeLineImage(value: unknown) {
  if (typeof value !== "string" || !value || value.length > Math.ceil(1024 * 1024 / 3) * 4) {
    throw new Error("送信する画像は1MB以下のJPEG・PNGに縮小してください");
  }
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
  catch { throw new Error("画像を読み込めませんでした"); }
  const contentType = imageContentType(bytes);
  if (!contentType || bytes.length > 1024 * 1024) throw new Error("送信する画像は1MB以下に縮小してください");
  return { bytes, contentType, extension: contentType === "image/png" ? "png" : "jpg" };
}

// 機密画像を公開URLにしない。LINEから取得する場合もサイズを制限する。
export async function fetchLineImage(token: string, messageId: string) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("LINEから画像を取得できません（保存期限切れの場合があります）");
  if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("画像が5MBを超えています");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("画像が空です");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_IMAGE_BYTES) throw new Error("画像が5MBを超えています");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  const contentType = imageContentType(bytes);
  if (!contentType) throw new Error("表示できる画像はJPEG・PNGです");
  return { bytes, contentType, extension: contentType === "image/png" ? "png" : "jpg" };
}
