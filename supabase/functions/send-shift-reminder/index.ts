// 翌日のセラピスト出勤（ルーム・時刻）と予約件数をスタッフLINEグループへリマインド
// pg_cron から毎日 reminder_time(JST) に1回呼び出される
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// JST の YYYY-MM-DD を返す（offsetDays 日後）
function jstDateStr(offsetDays = 0): string {
  const now = new Date();
  const jst = new Date(now.getTime() + (9 * 60 + offsetDays * 24 * 60) * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    const groupId = Deno.env.get("LINE_GROUP_ID");

    const supabase = createClient(supabaseUrl, serviceKey);

    // 手動テスト用に { force: true } を許可（通常の cron 呼び出しでは body 無し）
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch (_) { /* body 無し */ }

    // 設定取得
    const { data: settings } = await supabase
      .from("shop_settings")
      .select("id, line_reminder_enabled, line_reminder_last_sent")
      .limit(1)
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ skipped: "no settings" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force && settings.line_reminder_enabled === false) {
      return new Response(JSON.stringify({ skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const todayJst = jstDateStr(0);
    // 同日二重送信ガード
    if (!force && settings.line_reminder_last_sent === todayJst) {
      return new Response(JSON.stringify({ skipped: "already sent today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tomorrow = jstDateStr(1);

    // 翌日のシフト（却下以外）
    const { data: shifts } = await supabase
      .from("shifts")
      .select("cast_id, start_time, end_time, room, approval_status, casts(name)")
      .eq("shift_date", tomorrow)
      .neq("approval_status", "rejected")
      .order("start_time");

    // 翌日の予約（キャンセル以外）
    const { data: reservations } = await supabase
      .from("reservations")
      .select("cast_id, status")
      .eq("reservation_date", tomorrow)
      .neq("status", "cancelled");

    const countByCast = new Map<string, number>();
    for (const r of reservations ?? []) {
      if (!r.cast_id) continue;
      countByCast.set(r.cast_id, (countByCast.get(r.cast_id) ?? 0) + 1);
    }

    // cast_id 単位に集約（同一キャストの複数シフトは時間帯を結合）
    const grouped = new Map<string, { name: string; slots: string[]; rooms: Set<string> }>();
    for (const s of (shifts ?? []) as any[]) {
      if (!s.cast_id) continue;
      const name = s.casts?.name ?? "未設定";
      if (!grouped.has(s.cast_id)) {
        grouped.set(s.cast_id, { name, slots: [], rooms: new Set() });
      }
      const g = grouped.get(s.cast_id)!;
      g.slots.push(`${hhmm(s.start_time)}〜${hhmm(s.end_time)}`);
      if (s.room) g.rooms.add(s.room);
    }

    const dateLabel = tomorrow.replace(/^\d{4}-/, "").replace("-", "/");

    const lines: string[] = [`📅 明日（${dateLabel}）の出勤リマインド`, ""];

    if (grouped.size === 0) {
      lines.push("明日の出勤予定はありません。");
    } else {
      const entries = Array.from(grouped.entries()).sort((a, b) =>
        (a[1].slots[0] ?? "").localeCompare(b[1].slots[0] ?? "")
      );
      for (const [castId, g] of entries) {
        const reserveCount = countByCast.get(castId) ?? 0;
        const roomLabel = g.rooms.size > 0 ? Array.from(g.rooms).join("・") : "未設定";
        lines.push(`👤 ${g.name}`);
        lines.push(`　🏠 ${roomLabel}`);
        lines.push(`　⏰ ${g.slots.join(" / ")}`);
        lines.push(`　📋 予約 ${reserveCount}件`);
        lines.push("");
      }
      const total = Array.from(countByCast.values()).reduce((a, b) => a + b, 0);
      lines.push(`合計予約：${total}件 / 出勤 ${grouped.size}名`);
    }

    // ===== 来月の空き状況（シフトベース）=====
    try {
      const nowD = new Date();
      const jstNow = new Date(nowD.getTime() + 9 * 60 * 60 * 1000);
      const y = jstNow.getUTCFullYear();
      const m = jstNow.getUTCMonth();
      const pad = (n: number) => String(n).padStart(2, "0");
      const firstNext = new Date(Date.UTC(y, m + 1, 1));
      const lastNext = new Date(Date.UTC(y, m + 2, 0));
      const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const firstStr = fmt(firstNext);
      const lastStr = fmt(lastNext);
      const nextMonthLabel = `${firstNext.getUTCMonth() + 1}月`;

      const [{ data: nmShifts }, { data: nmRes }] = await Promise.all([
        supabase
          .from("shifts")
          .select("shift_date, cast_id, approval_status")
          .gte("shift_date", firstStr)
          .lte("shift_date", lastStr)
          .neq("approval_status", "rejected"),
        supabase
          .from("reservations")
          .select("reservation_date, status")
          .gte("reservation_date", firstStr)
          .lte("reservation_date", lastStr)
          .neq("status", "cancelled"),
      ]);

      const castsByDate = new Map<string, Set<string>>();
      for (const s of (nmShifts ?? []) as any[]) {
        if (!s.cast_id) continue;
        if (!castsByDate.has(s.shift_date)) castsByDate.set(s.shift_date, new Set());
        castsByDate.get(s.shift_date)!.add(s.cast_id);
      }
      const resByDate = new Map<string, number>();
      for (const r of (nmRes ?? []) as any[]) {
        resByDate.set(r.reservation_date, (resByDate.get(r.reservation_date) ?? 0) + 1);
      }

      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      lines.push("");
      lines.push("━━━━━━━━━━━━━");
      lines.push(`🗓️ 来月（${nextMonthLabel}）の空き状況`);
      lines.push("※ シフトベースの出勤/予約数");
      lines.push("");

      const shiftDates = Array.from(castsByDate.keys()).sort();
      if (shiftDates.length === 0) {
        lines.push("来月の出勤シフトはまだありません。");
      } else {
        let totalCastDays = 0;
        let totalRes = 0;
        for (const dateStr of shiftDates) {
          const castCount = castsByDate.get(dateStr)!.size;
          const resCount = resByDate.get(dateStr) ?? 0;
          totalCastDays += castCount;
          totalRes += resCount;
          const d = new Date(`${dateStr}T00:00:00Z`);
          const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dayNames[d.getUTCDay()]})`;
          const mark = resCount === 0 ? "◎空き多" : resCount < castCount * 2 ? "○空きあり" : "△";
          lines.push(`${label} 出勤${castCount}名・予約${resCount}件 ${mark}`);
        }
        lines.push("");
        lines.push(`合計：出勤のべ${totalCastDays}名・予約${totalRes}件`);
      }
    } catch (e) {
      console.error("next-month availability error:", e);
    }

    const message = lines.join("\n").trim();

    if (!lineToken || !groupId) {
      console.error("LINE credentials not configured");
      return new Response(JSON.stringify({ error: "LINE credentials not configured", preview: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
      body: JSON.stringify({ to: groupId, messages: [{ type: "text", text: message }] }),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error(`LINE API error [${lineRes.status}]: ${errText}`);
      return new Response(JSON.stringify({ error: "LINE API failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 送信済み日を記録（同日二重送信防止）
    await supabase
      .from("shop_settings")
      .update({ line_reminder_last_sent: todayJst })
      .eq("id", settings.id);

    return new Response(JSON.stringify({ success: true, sent_for: tomorrow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-shift-reminder error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
