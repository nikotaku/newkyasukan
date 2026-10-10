// お客様用LINE公式アカウントの Webhook（LINE対応）。
// LINE Developers の Webhook URL に https://<project>.supabase.co/functions/v1/line-customer-webhook?k=<店舗の鍵> を設定する。
// お客様（1対1のトーク）から届いたメッセージを記録して返事待ちにし、スマホ通知はDBトリガー（push-notify の line_inbox）が送る。
// 返事はしない（LINE公式アカウントの管理画面のチャット・自動応答はそのまま使える）。5分たっても返事が無ければ line-customer-reply が一次対応する。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { messageToText, verifyLineSignature } from "../_shared/lineCustomerReply.ts";
import { getLineProfile, issueLineToken } from "../_shared/lineCustomerApi.ts";

interface LineEvent {
  type?: string;
  mode?: string;
  webhookEventId?: string;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string; fileName?: string };
}

type Channel = { storeId: string; enabled: boolean; channelId: string | null; channelSecret: string | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const key = new URL(req.url).searchParams.get("k") ?? "";
  if (!/^[0-9a-f]{32}$/.test(key)) return new Response("not found", { status: 404 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("get_line_customer_channel", { p_webhook_key: key });
  const channel = data as Channel | null;
  if (error || !channel?.storeId || !channel.channelSecret) return new Response("not found", { status: 404 });

  const raw = await req.text();
  if (!(await verifyLineSignature(raw, req.headers.get("x-line-signature"), channel.channelSecret))) {
    return new Response("bad signature", { status: 403 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw || "{}") as { events?: LineEvent[] }).events ?? [];
  } catch {
    return new Response("bad request", { status: 400 });
  }
  // 見張りをオフにしている間は受け取るだけ（LINEの「検証」ボタンも 200 で通す）
  if (!channel.enabled) return new Response("ok");

  let token: string | null = null;
  for (const ev of events) {
    if (ev.type !== "message" || ev.mode === "standby" || ev.source?.type !== "user" || !ev.source.userId) continue;
    const text = messageToText(ev.message);
    if (text === null) continue;
    let profile: { displayName?: string; pictureUrl?: string } | null = null;
    try {
      token ??= channel.channelId ? await issueLineToken(channel.channelId, channel.channelSecret) : null;
      if (token) profile = await getLineProfile(token, ev.source.userId);
    } catch (err) {
      console.error("line-customer-webhook profile", err instanceof Error ? err.message : String(err));
    }
    const { error: recordError } = await sb.rpc("record_line_customer_message", {
      p_store_id: channel.storeId,
      p_line_user_id: ev.source.userId,
      p_display_name: profile?.displayName ?? null,
      p_picture_url: profile?.pictureUrl ?? null,
      p_message_type: ev.message?.type ?? "text",
      p_text: text.slice(0, 5000),
      p_line_message_id: ev.message?.id ?? ev.webhookEventId ?? null,
    });
    if (recordError) console.error("line-customer-webhook record", recordError.message);
  }
  return new Response("ok");
});
