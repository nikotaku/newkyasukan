// セラピスト個人予約フォーム（KEIKA等）の送信通知。
// 店舗DBとは連携せず、external_bookings に記録＋指定メールへ通知するだけ。
//
// 環境変数:
//   RESEND_API_KEY … 設定時は Resend でメール送信（推奨）
//   RESEND_FROM    … 送信元（既定 onboarding@resend.dev）
//   KEIKA_NOTIFY_EMAIL … keika フォームの通知先（既定 smkn.ox.0913@gmail.com）

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// フォームごとの通知先（宛先はサーバー側で固定し、リクエストからは受け取らない）
const FORM_RECIPIENTS: Record<string, string> = {
  keika: Deno.env.get("KEIKA_NOTIFY_EMAIL") || "smkn.ox.0913@gmail.com",
};

interface Payload {
  form_slug: string;
  customer_name: string;
  customer_phone?: string;
  requested_date?: string;
  requested_time?: string;
  course?: string;
  options?: string[];
  total_price?: number;
  notes?: string;
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  try {
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM") || "onboarding@resend.dev",
          to: [to],
          subject,
          text,
        }),
      });
      if (!res.ok) console.error(`Resend error [${res.status}]: ${await res.text()}`);
      return res.ok;
    }
    // フォールバック: FormSubmit（不安定なため8秒で打ち切り）
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${to}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ _subject: subject, 予約内容: text }),
        signal: ctrl.signal,
      });
      if (!res.ok) console.error(`FormSubmit error [${res.status}]: ${await res.text()}`);
      return res.ok;
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    console.error("email send failed:", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const p: Payload = await req.json();
    const slug = (p.form_slug || "").toLowerCase();
    const to = FORM_RECIPIENTS[slug];
    if (!to || !p.customer_name?.trim()) {
      return new Response(JSON.stringify({ error: "invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const lines = [
      "🌸 新しい予約リクエストが届きました 🌸",
      "",
      `📅 希望日: ${p.requested_date ?? "未指定"}`,
      `⏰ 希望時間: ${p.requested_time ?? "未指定"}`,
      `💆 コース: ${p.course ?? "未指定"}`,
    ];
    if (p.options && p.options.length > 0) lines.push(`➕ オプション: ${p.options.join("、")}`);
    if (p.total_price) lines.push(`💴 合計(目安): ¥${p.total_price.toLocaleString()}`);
    lines.push("");
    lines.push(`お客様: ${p.customer_name}`);
    if (p.customer_phone) lines.push(`☎️ ${p.customer_phone}`);
    if (p.notes) {
      lines.push("");
      lines.push(`📝 ひとこと: ${p.notes}`);
    }
    const text = lines.join("\n");
    const subject = `【予約リクエスト】${p.requested_date ?? ""} ${p.requested_time ?? ""} ${p.customer_name}様`;

    const emailOk = await sendEmail(to, subject, text);

    // フェイルセーフ: メールの成否に関わらず記録を残す
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/external_bookings`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        form_slug: slug,
        customer_name: p.customer_name.trim().slice(0, 100),
        customer_phone: p.customer_phone?.trim().slice(0, 30) ?? null,
        requested_date: p.requested_date ?? null,
        requested_time: p.requested_time?.slice(0, 20) ?? null,
        course: p.course?.slice(0, 100) ?? null,
        options: p.options ?? null,
        total_price: p.total_price ?? null,
        notes: p.notes?.slice(0, 1000) ?? null,
        email_sent: emailOk,
      }),
    });
    const logged = insertRes.ok;
    if (!logged) console.error("log insert failed:", await insertRes.text());

    if (!emailOk && !logged) {
      return new Response(JSON.stringify({ error: "failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, email: emailOk }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-external-booking error:", err);
    return new Response(JSON.stringify({ error: "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
