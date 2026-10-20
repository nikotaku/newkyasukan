// セラピストのマイページ「画像アップロード」：本人のトークンで写真を上げる・一覧・削除する。
// 上げた写真は casts.management_photos（非公開のストック）に入り、HPに出すかはお店が編集画面の「HP表示」で決める。
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "cast-photos";
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_PHOTOS_PER_CAST = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const decodeImage = (value: unknown): { bytes: Uint8Array; type: "image/jpeg" | "image/png" | "image/webp" } => {
  const raw = text(value);
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("画像（JPEG・PNG・WebP）を選んでください");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error("画像が大きすぎます（6MBまで）");
  return { bytes, type: match[1] as "image/jpeg" | "image/png" | "image/webp" };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const token = text(body.token);
    const action = text(body.action) || "list";
    if (!token || token.length > 256) return json({ error: "マイページのURLが正しくありません" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: cast, error } = await admin.from("casts")
      .select("id, photos, management_photos")
      .eq("access_token", token)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!cast) return json({ error: "無効またはアーカイブ済みのリンクです" }, 401);

    const prefix = `therapist-uploads/${cast.id}/`;
    const shown: string[] = cast.photos ?? [];
    const stock: string[] = cast.management_photos ?? [];
    const own = (url: string) => url.includes(`/${BUCKET}/${prefix}`);
    const listResult = (s: string[], st: string[]) => ({
      photos: [...s.filter(own).map((url) => ({ url, shown: true })), ...st.filter(own).filter((u) => !s.includes(u)).map((url) => ({ url, shown: false }))],
    });

    if (action === "list") return json(listResult(shown, stock));

    if (action === "upload") {
      const mine = [...shown, ...stock].filter(own).length;
      if (mine >= MAX_PHOTOS_PER_CAST) return json({ error: `アップロードできるのは${MAX_PHOTOS_PER_CAST}枚までです。いらない写真を消してください` }, 400);
      const { bytes, type } = decodeImage(body.image);
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const path = `${prefix}${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: "3600" });
      if (uploadError) throw new Error("画像をアップロードできませんでした");
      const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const nextStock = [...stock, url];
      const { error: updateError } = await admin.from("casts").update({ management_photos: nextStock }).eq("id", cast.id);
      if (updateError) throw updateError;
      return json(listResult(shown, nextStock));
    }

    if (action === "remove") {
      const url = text(body.url);
      if (!url || !own(url)) return json({ error: "この写真は消せません" }, 400);
      if (shown.includes(url)) return json({ error: "HPに載っている写真は消せません。お店に連絡してください" }, 400);
      const nextStock = stock.filter((u) => u !== url);
      const { error: updateError } = await admin.from("casts").update({ management_photos: nextStock }).eq("id", cast.id);
      if (updateError) throw updateError;
      const path = url.slice(url.indexOf(`/${BUCKET}/`) + BUCKET.length + 2);
      await admin.storage.from(BUCKET).remove([path]);
      return json(listResult(shown, nextStock));
    }

    return json({ error: "不明な操作です" }, 400);
  } catch (error) {
    console.error("therapist-photos:", error);
    return json({ error: error instanceof Error ? error.message : "エラーが発生しました" }, 500);
  }
});
