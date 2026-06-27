// Gmailのカード決済通知メールを受け取り、LINEグループへ転送するWebhook。
// Google Apps Script から { subject, body, from } を POST して使う。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface PaymentMail {
  subject?: string;
  body?: string;
  from?: string;
  received_at?: string;
}

// メール本文/件名から金額（¥1,000 / 1,000円 など）を抽出
function extractAmount(text: string): string | null {
  const matches = text.match(/[¥￥]?\s?\d{1,3}(?:,\d{3})+(?:\s?円)?|\d+\s?円/g);
  if (!matches || matches.length === 0) return null;
  // 数値が最大のものを代表値とする
  let best = "";
  let bestVal = -1;
  for (const m of matches) {
    const val = parseInt(m.replace(/[^\d]/g, ""), 10);
    if (val > bestVal) { bestVal = val; best = `¥${val.toLocaleString()}`; }
  }
  return best || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    // 通知先は決済専用グループがあれば優先、無ければ予約通知と同じグループ
    const groupId = Deno.env.get("LINE_PAYMENT_GROUP_ID") || Deno.env.get("LINE_GROUP_ID");

    if (!token || !groupId) {
      return new Response(
        JSON.stringify({ error: "LINE credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 簡易認証：PAYMENT_WEBHOOK_SECRET が設定されている場合のみ検証（未設定なら素通り）
    const secret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
    if (secret) {
      const given = req.headers.get("x-webhook-secret");
      if (given !== secret) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const mail: PaymentMail = await req.json();
    const subject = (mail.subject ?? "").trim();
    const body = (mail.body ?? "").trim();
    const amount = extractAmount(`${subject}\n${body}`);

    // 本文は長すぎるとLINEで見づらいので冒頭を抜粋
    const snippet = body.length > 500 ? body.slice(0, 500) + "…" : body;

    const lines = [
      "💳 カード決済の通知が届きました",
      "",
    ];
    if (amount) lines.push(`💰 金額: ${amount}`);
    if (subject) lines.push(`📧 件名: ${subject}`);
    if (mail.from) lines.push(`📨 差出人: ${mail.from}`);
    if (mail.received_at) lines.push(`🕐 受信: ${mail.received_at}`);
    if (snippet) {
      lines.push("");
      lines.push("─────────────");
      lines.push(snippet);
    }

    const message = lines.join("\n");

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error(`LINE API error [${lineRes.status}]: ${errText}`);
      return new Response(
        JSON.stringify({ error: "LINE API failed", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, amount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-line-payment error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
