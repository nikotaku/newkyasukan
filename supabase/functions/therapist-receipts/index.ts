// セラピストのマイページ「交通費申請」の領収書：本人のトークンで、自分の申請に領収書の写真を付ける・見る。
// 写真は非公開バケット transport-receipts の <store_id>/<cast_id>/<申請ID>-<時刻>.<拡張子>。
// お店は管理画面（支払い管理の「交通費の申請」）から、ログイン中のスタッフとして自分の店舗の分だけ見られる（storage のポリシー）。
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "transport-receipts";
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const decodeImage = (value: unknown) => {
  const match = text(value).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("領収書の写真（JPEG・PNG・WebP）を選んでください");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error("写真が大きすぎます（8MBまで）");
  const type = match[1];
  return { bytes, type, ext: type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg" };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const token = text(body.token);
    const action = text(body.action);
    const expenseId = text(body.expense_id);
    if (!token || token.length > 256) return json({ error: "マイページのURLが正しくありません" }, 401);
    if (!UUID.test(expenseId)) return json({ error: "申請が見つかりません" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: cast, error: castError } = await admin.from("casts")
      .select("id, store_id")
      .eq("access_token", token)
      .eq("is_active", true)
      .maybeSingle();
    if (castError) throw castError;
    if (!cast) return json({ error: "無効なリンクです" }, 401);

    const { data: expense, error: expenseError } = await admin.from("therapist_transport_expenses")
      .select("id, cast_id, status, receipt_path")
      .eq("id", expenseId)
      .maybeSingle();
    if (expenseError) throw expenseError;
    if (!expense || expense.cast_id !== cast.id) return json({ error: "申請が見つかりません" }, 404);

    if (action === "view") {
      if (!expense.receipt_path) return json({ url: null });
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(expense.receipt_path, 60 * 10);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    if (action === "upload") {
      if (expense.status === "approved") return json({ error: "承認済みの申請の領収書は変えられません" }, 400);
      const image = decodeImage(body.image);
      const path = `${cast.store_id}/${cast.id}/${expense.id}-${Date.now()}.${image.ext}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, image.bytes, {
        contentType: image.type, upsert: false, cacheControl: "3600",
      });
      if (uploadError) throw new Error("領収書をアップロードできませんでした");
      const { error: updateError } = await admin.from("therapist_transport_expenses")
        .update({ receipt_path: path })
        .eq("id", expense.id);
      if (updateError) {
        await admin.storage.from(BUCKET).remove([path]);
        throw updateError;
      }
      if (expense.receipt_path) await admin.storage.from(BUCKET).remove([expense.receipt_path]);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (error) {
    console.error("therapist-receipts error", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "処理できませんでした" }, 400);
  }
});
