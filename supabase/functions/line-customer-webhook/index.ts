// お客様用LINE公式アカウントの Webhook（LINE対応）。
// LINE Developers の Webhook URL に https://<project>.supabase.co/functions/v1/line-customer-webhook?k=<店舗の鍵> を設定する。
// お客様（1対1のトーク）から届いたメッセージを記録して返事待ちにし、スマホ通知はDBトリガー（push-notify の line_inbox）が送る。
// 返事はしない（LINE公式アカウントの管理画面のチャット・自動応答はそのまま使える）。5分たっても返事が無ければ line-customer-reply が一次対応する。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { messageToText, verifyLineSignature } from "../_shared/lineCustomerReply.ts";
import { getLineProfile, issueLineToken, isHarnessRelay } from "../_shared/lineCustomerApi.ts";

interface LineEvent {
  type?: string;
  mode?: string;
  webhookEventId?: string;
  unsend?: { messageId?: string };
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string; fileName?: string };
}

import { fetchLineImage, LINE_MEDIA_BUCKET } from "../_shared/lineCustomerMedia.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type Channel = { storeId: string; enabled: boolean; channelId: string | null; channelSecret: string | null; forwardWebhook?: string | null };

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
  // 現在のLハーネスにも同じ署名付きWebhookを届ける。転送先は既存の固定ホストだけ。
  const relay = channel.forwardWebhook && isHarnessRelay(channel.forwardWebhook)
    ? fetch(channel.forwardWebhook, { method: "POST", headers: { "Content-Type": "application/json", "x-line-signature": req.headers.get("x-line-signature")! },
        body: raw, signal: AbortSignal.timeout(10_000), redirect: "error" })
      .then((r) => { if (!r.ok) throw new Error(`relay ${r.status}`); return true; })
      .catch((err) => { console.error("Lハーネスへの転送失敗", err instanceof Error ? err.message : "failed"); return false; })
    : Promise.resolve(true);
  // 見張りをオフにしている間は受け取るだけ（LINEの「検証」ボタンも 200 で通す）
  if (!channel.enabled) return new Response(await relay ? "ok" : "retry", { status: await relay ? 200 : 503 });

  let token: string | null = null;
  let failed = false;
  for (const ev of events) {
    if (ev.type === "unsend" && ev.unsend?.messageId && ev.source?.userId) {
      const { data: thread } = await sb.from("line_customer_threads").select("id")
        .eq("store_id", channel.storeId).eq("line_user_id", ev.source.userId).maybeSingle();
      if (thread) {
        const { data: message } = await sb.from("line_customer_messages").select("id,media_path,text")
          .eq("thread_id", thread.id).eq("line_message_id", ev.unsend.messageId).maybeSingle();
        if (message) {
          const { error } = await sb.from("line_customer_messages").update({ text: "[送信が取り消されました]", message_type: "unsent", media_path: null }).eq("id", message.id);
          if (error) failed = true;
          else if (message.media_path) await sb.storage.from(LINE_MEDIA_BUCKET).remove([message.media_path]);
          await sb.from("line_customer_threads").update({ last_message_text: "[送信が取り消されました]" })
            .eq("id", thread.id).eq("last_message_text", message.text?.slice(0, 500) ?? "");
        }
      }
      continue;
    }
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
    if (recordError) {
      console.error("line-customer-webhook record", recordError.message);
      failed = true;
      continue;
    }
    if (ev.message?.type === "image" && ev.message.id && token) {
      const messageId = ev.message.id;
      const imageToken = token;
      const saveImage = async () => {
        const { data: message } = await sb.from("line_customer_messages").select("id,thread_id,media_path,message_type")
          .eq("store_id", channel.storeId).eq("line_message_id", messageId).maybeSingle();
        if (!message || message.media_path || message.message_type !== "image") return;
        const image = await fetchLineImage(imageToken, messageId);
        const path = `${channel.storeId}/${message.thread_id}/in-${messageId}.${image.extension}`;
        const { error } = await sb.storage.from(LINE_MEDIA_BUCKET).upload(path, image.bytes, { contentType: image.contentType, upsert: true });
        if (error) throw error;
        const { data: updated, error: updateError } = await sb.from("line_customer_messages").update({ media_path: path })
          .eq("id", message.id).eq("message_type", "image").select("id").maybeSingle();
        if (updateError || !updated) await sb.storage.from(LINE_MEDIA_BUCKET).remove([path]);
      };
      const task = saveImage().catch((err) => console.error("LINE画像保存", err instanceof Error ? err.message : "failed"));
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
      else await task;
    }
  }
  if (!(await relay)) failed = true;
  return new Response(failed ? "retry" : "ok", { status: failed ? 503 : 200 });
});
