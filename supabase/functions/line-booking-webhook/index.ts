// WEB予約通知専用のLINE公式アカウントのWebhook。
// メインの公式アカウントが日報・シフト等の通知で月間上限(429)に達しても
// 予約通知だけは届くよう、予約通知は別アカウントから送る（notify-line-booking）。
// ここでは、そのアカウントが投稿するグループを登録する操作だけを受け付ける。
//   通知を受け取りたいグループ内で、管理者が「予約通知登録」（全力は「予約通知登録 全力」）と送信
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseBookingDestinationCommand } from "./bookingDestinationCommand.ts";

interface LineEvent {
  type?: string;
  replyToken?: string;
  source?: { groupId?: string; userId?: string };
  message?: { type?: string; text?: string };
}

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return difference === 0;
}

// 応答メッセージ（reply）は月間の送信数にカウントされない。
async function reply(token: string, replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");

  try {
    const token = Deno.env.get("LINE_BOOKING_CHANNEL_ACCESS_TOKEN");
    const secret = Deno.env.get("LINE_BOOKING_CHANNEL_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !secret || !supabaseUrl || !serviceKey) {
      console.error("LINE booking channel is not configured");
      return new Response("not configured", { status: 503 });
    }

    const raw = await req.text();
    const signatureValid = await verifySignature(raw, req.headers.get("x-line-signature"), secret);
    if (!signatureValid) return new Response("bad signature", { status: 403 });

    const events = (JSON.parse(raw || "{}") as { events?: LineEvent[] }).events || [];
    // プロバイダーが違うとユーザーIDも変わるため、専用の管理者IDを優先する。
    const adminUserIds = new Set(
      (Deno.env.get("LINE_BOOKING_ADMIN_USER_IDS") || Deno.env.get("LINE_NOTIFICATION_ADMIN_USER_IDS") || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const ev of events) {
      if (ev.type === "join") {
        if (ev.replyToken) {
          await reply(token, ev.replyToken,
            "招待ありがとうございます🙌\nこのグループにWEB予約の通知を届けるには、管理者の方が「予約通知登録」と送信してください。");
        }
        continue;
      }

      if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) continue;
      const command = parseBookingDestinationCommand(ev.message.text || "");
      if (!command) continue;

      if (command.kind === "unknown_store") {
        await reply(token, ev.replyToken, "店舗名は「艶華」か「全力」で送ってください。\n例）予約通知登録 艶華");
        continue;
      }
      const groupId = ev.source?.groupId;
      if (!groupId) {
        await reply(token, ev.replyToken, "この操作は、予約通知を受け取りたいLINEグループの中で送ってください。");
        continue;
      }
      const userId = ev.source?.userId;
      if (!userId || !adminUserIds.has(userId)) {
        await reply(token, ev.replyToken, "この操作を行う権限がありません。管理者へご連絡ください。");
        continue;
      }

      const { error } = await sb
        .from("line_notification_destinations")
        .upsert({
          store_id: command.storeId,
          destination_key: "web_booking",
          line_group_id: groupId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "store_id,destination_key" });
      if (error) {
        console.error("Booking notification destination update failed", { code: error.code });
        await reply(token, ev.replyToken, "登録に失敗しました。時間をおいてもう一度送ってください。");
        continue;
      }
      await reply(token, ev.replyToken,
        `✅ ${command.storeLabel}のWEB予約通知を、今後はこのアカウントからこのグループへ送ります。`);
    }

    return new Response("ok");
  } catch (err) {
    console.error("line-booking-webhook error:", err instanceof Error ? err.message : "unknown");
    // LINEには200を返す（再送ループ防止）
    return new Response("ok");
  }
});
