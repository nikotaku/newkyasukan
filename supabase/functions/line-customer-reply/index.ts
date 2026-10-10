// お客様用LINE（LINE対応）の返信。
//  - { action: "auto", threadIds } … pg_cron（private.dispatch_line_auto_replies）から。x-line-customer-secret
//      決めた時間（既定5分）返事が無い会話に、Claude が考えた一次対応の返事を送る
//  - { action: "send", threadId, text } … 管理画面から返信（ログイン中のスタッフ・その店舗だけ）
//  - { action: "draft", threadId } … 返信の下書きをAIで作る（送らない）
//  - { action: "verify", storeId } … LINEにつながるか確かめる（店長・オーナー）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAutoReplyPrompt,
  type ConversationLine,
  finalizeReply,
  type StoreFacts,
  tokyoClock,
} from "../_shared/lineCustomerReply.ts";
import { getLineBotInfo, getLineWebhookEndpoint, issueLineToken, pushLineMessage } from "../_shared/lineCustomerApi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-customer-secret",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MODEL = "claude-sonnet-5-5";

type Channel = { storeId: string; enabled: boolean; autoReply: boolean; instructions: string | null; channelId: string | null; channelSecret: string | null };
type Thread = { id: string; store_id: string; line_user_id: string; display_name: string | null; status: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function loadChannel(storeId: string) {
  const { data, error } = await sb.rpc("get_line_customer_channel", { p_store_id: storeId });
  if (error) throw new Error(error.message);
  const channel = data as Channel | null;
  if (!channel?.channelId || !channel.channelSecret) throw new Error("お客様用LINEの Channel ID・Channel secret が未登録です");
  return channel;
}

async function loadFacts(storeId: string, instructions: string | null): Promise<StoreFacts> {
  const clock = tokyoClock();
  const [{ data: info }, { data: store }, { data: courses }, { data: options }, { data: nominations }, { data: shifts }] = await Promise.all([
    sb.from("store_info").select("name,hours,holiday,address,phone").eq("store_id", storeId).maybeSingle(),
    sb.from("stores").select("name,settings").eq("id", storeId).maybeSingle(),
    sb.rpc("get_public_back_rates", { p_store_id: storeId }),
    sb.from("option_rates").select("option_name,customer_price").eq("store_id", storeId).eq("is_visible", true).order("display_order"),
    sb.from("nomination_rates").select("nomination_type,customer_price").eq("store_id", storeId),
    sb.from("shifts")
      .select("shift_date,start_time,end_time,status,approval_status,casts(name,is_active,is_visible)")
      .eq("store_id", storeId)
      .in("shift_date", [clock.businessDate, clock.tomorrow]),
  ]);
  const settings = (store?.settings ?? {}) as { public_url?: string };
  type ShiftRow = { shift_date: string; start_time: string | null; end_time: string | null; status: string | null; approval_status: string | null; casts: { name: string; is_active: boolean; is_visible: boolean } | null };
  return {
    storeName: info?.name || store?.name || "当店",
    hours: info?.hours ?? null,
    holiday: info?.holiday ?? null,
    address: info?.address ?? null,
    phone: info?.phone ?? null,
    siteUrl: (settings.public_url || "https://enka-salon.jp").replace(/\/+$/, ""),
    courses: ((courses ?? []) as Array<{ course_type: string; duration: number; customer_price: number; description?: string | null }>)
      .filter((c) => c.course_type !== "DR" && c.customer_price > 0)
      .map((c) => ({ type: c.course_type, minutes: c.duration, price: c.customer_price, description: c.description ?? null })),
    options: ((options ?? []) as Array<{ option_name: string; customer_price: number }>).map((o) => ({ name: o.option_name, price: o.customer_price })),
    nominations: ((nominations ?? []) as Array<{ nomination_type: string; customer_price: number }>).map((n) => ({ type: n.nomination_type, price: n.customer_price })),
    shifts: ((shifts ?? []) as unknown as ShiftRow[])
      .filter((s) => s.casts?.is_active && s.casts.is_visible && s.approval_status !== "rejected" && !["cancelled", "canceled", "absent"].includes(s.status ?? ""))
      .map((s) => ({ name: s.casts!.name, date: s.shift_date, start: s.start_time, end: s.end_time })),
    today: clock.businessDate,
    now: clock.time,
    instructions,
  };
}

async function conversationOf(threadId: string) {
  const { data } = await sb.from("line_customer_messages")
    .select("direction,text,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as ConversationLine[]).reverse();
}

async function generateReply(threadId: string, storeId: string, instructions: string | null) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が未設定です");
  const [facts, conversation] = await Promise.all([loadFacts(storeId, instructions), conversationOf(threadId)]);
  const { system, user } = buildAutoReplyPrompt(facts, conversation);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AIで返事を作れませんでした（${response.status}）${detail.slice(0, 200)}`);
  }
  const body = await response.json() as { content?: Array<{ type: string; text?: string }> };
  return (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
}

async function autoReply(threadIds: string[]) {
  const results: Array<{ threadId: string; result: string }> = [];
  for (const threadId of threadIds.slice(0, 20)) {
    const { data: claimed } = await sb.rpc("claim_line_auto_reply", { p_thread_id: threadId });
    const claim = claimed as { threadId: string; storeId: string; lineUserId: string } | null;
    if (!claim) {
      results.push({ threadId, result: "skipped" });
      continue;
    }
    try {
      const channel = await loadChannel(claim.storeId);
      const raw = await generateReply(threadId, claim.storeId, channel.instructions);
      const text = finalizeReply(raw);
      if (!text) {
        // スタンプ・お礼だけなど、返事が要らないと判断したもの
        await sb.from("line_customer_threads")
          .update({ status: "auto_replied", auto_replied_at: new Date().toISOString(), error: "返事が要らないメッセージと判断したので送っていません" })
          .eq("id", threadId).eq("status", "replying");
        results.push({ threadId, result: "no_reply_needed" });
        continue;
      }
      const token = await issueLineToken(channel.channelId!, channel.channelSecret!);
      const sent = await pushLineMessage(token, claim.lineUserId, text, crypto.randomUUID());
      await sb.rpc("finish_line_customer_reply", {
        p_thread_id: threadId, p_direction: "ai", p_ok: sent.ok, p_text: text, p_error: sent.ok ? null : sent.error, p_user_id: null,
      });
      results.push({ threadId, result: sent.ok ? "sent" : "failed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sb.rpc("finish_line_customer_reply", { p_thread_id: threadId, p_direction: "ai", p_ok: false, p_text: null, p_error: message, p_user_id: null });
      results.push({ threadId, result: "failed" });
    }
  }
  return results;
}

async function staffUser(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error("ログインが必要です"), { status: 401 });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("ログインが期限切れです"), { status: 401 });
  return data.user;
}

async function storeRole(userId: string, storeId: string) {
  const { data } = await sb.from("user_stores").select("role").eq("user_id", userId).eq("store_id", storeId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

async function threadForStaff(userId: string, threadId: string) {
  const { data: thread } = await sb.from("line_customer_threads").select("id,store_id,line_user_id,display_name,status").eq("id", threadId).maybeSingle();
  if (!thread || !(await storeRole(userId, (thread as Thread).store_id))) {
    throw Object.assign(new Error("この会話を見る権限がありません"), { status: 403 });
  }
  return thread as Thread;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    if (body.action === "auto") {
      const secret = req.headers.get("x-line-customer-secret");
      const { data: ok } = secret ? await sb.rpc("verify_line_customer_secret", { candidate: secret }) : { data: false };
      if (!ok) return json({ error: "Unauthorized" }, 401);
      const ids = Array.isArray(body.threadIds) ? body.threadIds.filter((id): id is string => typeof id === "string") : [];
      return json({ results: await autoReply(ids) });
    }

    const user = await staffUser(req);
    if (body.action === "send") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return json({ error: "本文を入れてください" }, 400);
      if (text.length > 4000) return json({ error: "本文が長すぎます（4000文字まで）" }, 400);
      const thread = await threadForStaff(user.id, String(body.threadId ?? ""));
      const channel = await loadChannel(thread.store_id);
      const token = await issueLineToken(channel.channelId!, channel.channelSecret!);
      const sent = await pushLineMessage(token, thread.line_user_id, text, typeof body.retryKey === "string" ? body.retryKey : crypto.randomUUID());
      if (!sent.ok) return json({ error: sent.error }, 502);
      await sb.rpc("finish_line_customer_reply", { p_thread_id: thread.id, p_direction: "staff", p_ok: true, p_text: text, p_error: null, p_user_id: user.id });
      return json({ ok: true });
    }
    if (body.action === "draft") {
      const thread = await threadForStaff(user.id, String(body.threadId ?? ""));
      const channel = await loadChannel(thread.store_id);
      const raw = await generateReply(thread.id, thread.store_id, channel.instructions);
      // 下書きには自動応答の一文を付けない（スタッフが送るため）
      const draft = finalizeReply(raw)?.replace(/\n\n（自動応答）[^\n]*$/, "") ?? "";
      return json({ draft, noReplyNeeded: !draft });
    }
    if (body.action === "verify") {
      const storeId = String(body.storeId ?? "");
      if (!["owner", "manager"].includes((await storeRole(user.id, storeId)) ?? "")) {
        return json({ error: "店長・オーナーだけが確認できます" }, 403);
      }
      const { data: settings } = await sb.from("line_customer_settings").select("webhook_key").eq("store_id", storeId).maybeSingle();
      const expectedUrl = settings?.webhook_key ? `${SUPABASE_URL}/functions/v1/line-customer-webhook?k=${settings.webhook_key}` : null;
      try {
        const channel = await loadChannel(storeId);
        const token = await issueLineToken(channel.channelId!, channel.channelSecret!);
        const [info, endpoint] = await Promise.all([getLineBotInfo(token), getLineWebhookEndpoint(token)]);
        await sb.rpc("set_line_customer_verified", { p_store_id: storeId, p_basic_id: info.basicId ?? null, p_name: info.displayName ?? null, p_error: null });
        return json({
          ok: true,
          basicId: info.basicId,
          name: info.displayName,
          chatMode: info.chatMode,
          webhookUrl: expectedUrl,
          webhookSet: Boolean(endpoint?.endpoint && expectedUrl && endpoint.endpoint === expectedUrl),
          webhookActive: endpoint?.active ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await sb.rpc("set_line_customer_verified", { p_store_id: storeId, p_basic_id: null, p_name: null, p_error: message });
        return json({ ok: false, error: message, webhookUrl: expectedUrl }, 200);
      }
    }
    return json({ error: "未対応の操作です" }, 400);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return json({ error: err instanceof Error ? err.message : String(err) }, status);
  }
});
