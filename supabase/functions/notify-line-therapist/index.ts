// 予約確認SMS送信と同時に、担当セラピストのグループLINEへ予約内容を共有する。
// 管理画面（Schedule）のSMSボタンから呼び出される。
// 送信先: casts.line_group_id（セラピストごとのグループ）。
// 未登録の場合は LINE_THERAPIST_GROUP_ID（共通グループ）にフォールバック。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  cast_id?: string | null;
  customer_name: string;
  cast_name: string;
  reservation_date: string; // 表示用（例: 7月6日(月)）
  start_time: string;       // 表示用（例: 24:40）
  course_name: string;
  room?: string | null;
  options?: string[] | null;
  notes?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "LINE token not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const p: Payload = await req.json();

    // 担当セラピストのグループIDを取得（未登録なら共通グループにフォールバック）
    let groupId: string | null = null;
    if (p.cast_id) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await sb.from("casts").select("line_group_id").eq("id", p.cast_id).maybeSingle();
      groupId = (data as any)?.line_group_id ?? null;
    }
    if (!groupId) groupId = Deno.env.get("LINE_THERAPIST_GROUP_ID") ?? null;
    if (!groupId) {
      return new Response(JSON.stringify({ error: "このセラピストのLINEグループが未登録です（グループ内で「連携 名前」を送信してください）" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lines = [
      "🔔 新規予約のご案内",
      "",
      `📅 ${p.reservation_date}`,
      `⏰ ${p.start_time}〜`,
      `💆 ${p.course_name}`,
      `👤 担当：${p.cast_name}`,
    ];
    if (p.options && p.options.length > 0) lines.push(`➕ オプション：${p.options.join("、")}`);
    if (p.room) lines.push(`🏠 ルーム：${p.room}`);
    lines.push(`お客様：${p.customer_name} 様`);
    if (p.notes) {
      lines.push("");
      lines.push(`📝 ${p.notes}`);
    }

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: groupId, messages: [{ type: "text", text: lines.join("\n") }] }),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error(`LINE API error [${lineRes.status}]: ${errText}`);
      return new Response(JSON.stringify({ error: "LINE API failed", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-line-therapist error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
