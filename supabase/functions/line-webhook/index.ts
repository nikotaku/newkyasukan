// LINE Webhook 受信。セラピストのグループLINEで「連携 セラピスト名」と
// 送信すると、そのグループを casts.line_group_id に自動紐付けする。
// 例: グループ内で「連携 はる」→ はるの予約共有グループとして登録。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
};

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

async function reply(token: string, replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    const secret = Deno.env.get("LINE_CHANNEL_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!token) return new Response("ok", { headers: corsHeaders }); // 未設定でも200（LINE検証用）

    const raw = await req.text();
    // 署名検証（LINE_CHANNEL_SECRET が設定されている場合のみ）
    if (secret) {
      const ok = await verifySignature(raw, req.headers.get("x-line-signature"), secret);
      if (!ok) return new Response("bad signature", { status: 403, headers: corsHeaders });
    }

    const body = JSON.parse(raw || "{}");
    const events: any[] = body.events || [];
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    for (const ev of events) {
      const groupId: string | undefined = ev.source?.groupId;
      if (!groupId) continue;

      if (ev.type === "join") {
        // ボットがグループに招待された時の案内
        if (ev.replyToken) {
          await reply(token, ev.replyToken,
            "招待ありがとうございます🙌\nこのグループをセラピストの予約共有先にするには、\n「連携 セラピスト名」と送信してください。\n例）連携 はる");
        }
        continue;
      }

      if (ev.type === "message" && ev.message?.type === "text") {
        const text: string = (ev.message.text || "").trim();
        const m = text.match(/^連携[\s　]+(.+)$/);
        if (!m) continue;
        const name = m[1].trim();

        const { data: cast } = await sb
          .from("casts")
          .select("id, name")
          .eq("name", name)
          .maybeSingle();

        if (!cast) {
          if (ev.replyToken) {
            await reply(token, ev.replyToken, `「${name}」というセラピストが見つかりませんでした🙇\n管理画面の登録名と同じ名前で送ってください。`);
          }
          continue;
        }

        const { error } = await sb
          .from("casts")
          .update({ line_group_id: groupId })
          .eq("id", cast.id);

        if (ev.replyToken) {
          await reply(token, ev.replyToken,
            error
              ? "登録に失敗しました。もう一度お試しください🙇"
              : `✅ このグループを「${cast.name}」の予約共有グループとして登録しました！\n今後、${cast.name}の予約確認SMS送信時に予約内容が自動で届きます。`);
        }
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("line-webhook error:", err);
    // LINEには常に200を返す（再送ループ防止）
    return new Response("ok", { headers: corsHeaders });
  }
});
