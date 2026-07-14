// Twilio 050番号の着信Webhook（CTI）。
// 着信 → 顧客照合＋cti_callsへ記録（管理画面がRealtimeで着信ポップ表示）→ 転送先へつなぐTwiMLを返す。
// Twilioコンソールで対象番号の Voice Webhook にこの関数のURLを設定する。
//
// 環境変数:
//   CTI_FORWARD_NUMBER … 転送先電話番号（E.164形式、既定 +819081264042）。
//                        "none" を設定すると転送せず、アナウンス→切断（ポップと履歴のみ）になる。

const FORWARD_NUMBER = Deno.env.get("CTI_FORWARD_NUMBER") || "+819081264042";
const NO_FORWARD = FORWARD_NUMBER === "none";

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const event = url.searchParams.get("event") ?? "incoming";
    const params = new URLSearchParams(await req.text());
    const callSid = params.get("CallSid") ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // 転送終了後のコールバック：応答/不在/話中の結果と通話時間を記録
    if (event === "dial-result") {
      const dialStatus = params.get("DialCallStatus") ?? "unknown";
      const duration = parseInt(params.get("DialCallDuration") ?? "0", 10) || null;
      await fetch(
        `${supabaseUrl}/rest/v1/cti_calls?call_sid=eq.${encodeURIComponent(callSid)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: dialStatus,
            duration_seconds: duration,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      return twiml("<Hangup/>");
    }

    // 着信：+81形式を0始まりに直して顧客照合＋記録（RPCで1回）
    const fromRaw = params.get("From") ?? "";
    const toRaw = params.get("To") ?? "";
    const from = fromRaw.replace(/^\+81/, "0");
    const to = toRaw.replace(/^\+81/, "0");

    await fetch(`${supabaseUrl}/rest/v1/rpc/cti_log_incoming`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_call_sid: callSid, p_from: from, p_to: to }),
    });

    // 転送なし運用：アナウンスを流して切断し、不在着信として記録（ポップと履歴で折り返す）
    if (NO_FORWARD) {
      await fetch(
        `${supabaseUrl}/rest/v1/cti_calls?call_sid=eq.${encodeURIComponent(callSid)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "no-answer", updated_at: new Date().toISOString() }),
        },
      );
      return twiml(
        `<Say language="ja-JP">お電話ありがとうございます。ただいま電話に出ることができません。こちらの番号へ折り返しご連絡いたしますので、少々お待ちください。</Say><Hangup/>`,
      );
    }

    // 発信者番号をそのまま引き継いで転送先を呼び出す（Dialの既定動作）
    const selfUrl = `${supabaseUrl}/functions/v1/cti-incoming?event=dial-result`;
    return twiml(
      `<Dial action="${selfUrl}" timeout="25">${FORWARD_NUMBER}</Dial>`,
    );
  } catch (err) {
    console.error("cti-incoming error:", err);
    // エラー時でも電話は転送する（記録より通話を優先）
    if (NO_FORWARD) return twiml("<Hangup/>");
    return twiml(`<Dial timeout="25">${FORWARD_NUMBER}</Dial>`);
  }
});
