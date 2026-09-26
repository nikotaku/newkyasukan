// Gmailに届くレポートメールの取り込み口。
// 店舗のGmailで動く Google Apps Script（scripts/gmail-report-sync.gs）が15分ごとに
// IVRyの着信通知とエステ魂のデイリーレポートを送ってくる。Codexなどの手作業なしで問い合わせ集計を埋める。
//
// 認証: ヘッダー x-ingest-token。report_ingest_tokens にSHA-256で保存したトークンから店舗を決める。
// 同じメールは何度届いても1回だけ取り込む（Gmailのメッセージ ID で判定）。
// エステ魂の日次は、その日の行が既にあれば上書きしない（読み取り結果は report_email_messages に残す）。

import {
  classifyReportEmail,
  parseEstamaDailyReport,
  parseIvryCall,
  type ReportEmail,
} from "./parse.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

const MAX_MESSAGES = 100;
const MAX_BODY_LENGTH = 20_000;
const FINAL_STATUSES = new Set(["imported", "duplicate", "kept_existing", "ignored"]);

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, Prefer: "return=representation", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const inList = (values: string[]) => `(${values.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;

function toEmail(raw: unknown): ReportEmail | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const subject = typeof r.subject === "string" ? r.subject : "";
  const date = typeof r.date === "string" && !Number.isNaN(new Date(r.date).getTime()) ? r.date : "";
  if (!/^[\w-]{6,64}$/.test(id) || !subject || !date) return null;
  return {
    id,
    subject: subject.slice(0, 300),
    from: typeof r.from === "string" ? r.from.slice(0, 300) : "",
    date,
    body: typeof r.body === "string" ? r.body.slice(0, MAX_BODY_LENGTH) : "",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const token = req.headers.get("x-ingest-token")?.trim() || "";
    if (token.length < 32) return json(401, { error: "invalid token" });
    const [tokenRow] = await sb(`report_ingest_tokens?token_hash=eq.${await sha256Hex(token)}&select=id,store_id`);
    if (!tokenRow) return json(401, { error: "invalid token" });
    const storeId: string = tokenRow.store_id;

    const payload = await req.json().catch(() => null) as { messages?: unknown[] } | null;
    const emails = (Array.isArray(payload?.messages) ? payload!.messages : [])
      .slice(0, MAX_MESSAGES)
      .map(toEmail)
      .filter((email): email is ReportEmail => email !== null);
    await sb(`report_ingest_tokens?id=eq.${tokenRow.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    });
    if (!emails.length) return json(200, { received: 0, imported: 0 });

    const ids = emails.map((email) => email.id);
    const known = await sb(
      `report_email_messages?store_id=eq.${storeId}&message_id=in.${inList(ids)}&select=message_id,status`,
    ) as Array<{ message_id: string; status: string }>;
    const done = new Set(known.filter((row) => FINAL_STATUSES.has(row.status)).map((row) => row.message_id));
    const pending = emails.filter((email) => !done.has(email.id));
    if (!pending.length) return json(200, { received: emails.length, imported: 0 });

    // 既に取り込み済みの着信（以前のCodex取り込み分を含む）と、既存のエステ魂日次
    const pendingIds = pending.map((email) => email.id);
    const [existingCalls, existingReports, [lastReport]] = await Promise.all([
      sb(`inquiries?store_id=eq.${storeId}&source=eq.ivry_email&source_message_id=in.${inList(pendingIds)}&select=source_message_id`),
      sb(`external_daily_reports?store_id=eq.${storeId}&provider=eq.estama&select=report_date,source_message_id&order=report_date.desc&limit=400`),
      sb(`external_daily_reports?store_id=eq.${storeId}&provider=eq.estama&select=external_store_id&order=report_date.desc&limit=1`),
    ]);
    const importedCallIds = new Set((existingCalls || []).map((row: { source_message_id: string }) => row.source_message_id));
    const reportsByDate = new Map<string, string | null>(
      (existingReports || []).map((row: { report_date: string; source_message_id: string | null }) => [row.report_date, row.source_message_id]),
    );

    const records: Array<Record<string, unknown>> = [];
    let imported = 0;
    for (const email of pending) {
      const kind = classifyReportEmail(email.subject);
      const base = {
        store_id: storeId,
        message_id: email.id,
        kind,
        subject: email.subject,
        sender: email.from || null,
        received_at: new Date(email.date).toISOString(),
        body: email.body,
        updated_at: new Date().toISOString(),
      };
      try {
        if (kind === "ivry_call") {
          const call = parseIvryCall(email);
          if (importedCallIds.has(email.id)) {
            records.push({ ...base, parsed: call, status: "duplicate", error: null });
            continue;
          }
          await sb("inquiries", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              store_id: storeId,
              channel: "phone",
              source: "ivry_email",
              source_message_id: email.id,
              source_subject: email.subject,
              caller_number: call.callerNumber,
              call_status: call.callStatus,
              memo: call.memo,
              inquired_at: call.inquiredAt,
            }),
          });
          importedCallIds.add(email.id);
          imported += 1;
          records.push({ ...base, parsed: call, status: "imported", error: null });
        } else if (kind === "estama_daily_report") {
          const report = parseEstamaDailyReport(email);
          if ("error" in report) {
            records.push({ ...base, parsed: null, status: "unparsed", error: report.error });
            continue;
          }
          if (reportsByDate.has(report.reportDate)) {
            const sameMessage = reportsByDate.get(report.reportDate) === email.id;
            records.push({ ...base, parsed: report, status: sameMessage ? "duplicate" : "kept_existing", error: null });
            continue;
          }
          await sb("external_daily_reports", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              store_id: storeId,
              provider: "estama",
              external_store_id: report.externalStoreId || lastReport?.external_store_id || "",
              report_date: report.reportDate,
              page_views: report.pageViews,
              inquiry_count: report.inquiryCount,
              source_message_id: email.id,
              source_subject: email.subject,
            }),
          });
          reportsByDate.set(report.reportDate, email.id);
          imported += 1;
          records.push({ ...base, parsed: report, status: "imported", error: null });
        } else {
          records.push({ ...base, parsed: null, status: "ignored", error: null });
        }
      } catch (error) {
        // 1通の失敗で残りを止めない。次回の送信で取り込み直す
        records.push({ ...base, parsed: null, status: "received", error: String(error instanceof Error ? error.message : error).slice(0, 500) });
      }
    }

    await sb("report_email_messages?on_conflict=store_id,message_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(records),
    });
    const summary = records.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({ event: "report_email_ingest", storeId, received: emails.length, imported, summary }));
    return json(200, { received: emails.length, imported, summary });
  } catch (error) {
    console.error("report-email-ingest error:", error);
    return json(500, { error: "取り込みに失敗しました" });
  }
});
