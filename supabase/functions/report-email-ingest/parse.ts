// Gmailに届くレポートメールの読み取り。
// - IVRyの着信通知「【着信内容の報告通知】090-xxxx-xxxxからのお電話【IVRy】」→ 問い合わせ（電話）1件
// - 「【エステ魂】デイリーレポート(9月8日集計分)」→ その日のエステ魂のアクセス数・問い合わせ数
// 本文の書式は各サービス次第なので、読み取れないときは推測で埋めずに unparsed として残す。

export type ReportEmailKind = "ivry_call" | "estama_daily_report" | "unknown";

export interface ReportEmail {
  id: string;
  subject: string;
  from?: string;
  date: string; // 受信日時（ISO）
  body: string;
}

export interface IvryCall {
  callerNumber: string | null;
  inquiredAt: string; // ISO
  callStatus: string | null;
  memo: string | null;
}

export interface EstamaDailyReport {
  reportDate: string; // YYYY-MM-DD（日本時間）
  pageViews: number;
  inquiryCount: number;
  externalStoreId: string | null;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function classifyReportEmail(subject: string): ReportEmailKind {
  if (/着信内容の報告通知/.test(subject) && /IVRy/i.test(subject)) return "ivry_call";
  if (/エステ魂/.test(subject) && /デイリーレポート/.test(subject)) return "estama_daily_report";
  return "unknown";
}

// 全角の数字・記号を半角にし、数字の桁区切りカンマを外す
export function normalizeText(value: string) {
  return value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－ー―‐]/g, (c, offset, all) => (/\d/.test(all[offset - 1] || "") ? "-" : c))
    .replace(/：/g, ":")
    .replace(/，/g, ",")
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1")
    .replace(/\r\n?/g, "\n");
}

const jstParts = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

const jstIso = (year: number, month: number, day: number, hour: number, minute: number, second: number) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute, second) - JST_OFFSET_MS).toISOString();

const pad = (value: number) => String(value).padStart(2, "0");

export function parseIvryCall(email: ReportEmail): IvryCall {
  const subject = normalizeText(email.subject);
  const body = normalizeText(email.body || "");

  const callerMatch = subject.match(/】\s*(.+?)\s*からのお電話/);
  const rawCaller = callerMatch?.[1]?.trim() || "";
  const callerNumber = /\d{6,}|\d+-\d+-\d+/.test(rawCaller) ? rawCaller.replace(/[^\d+-]/g, "") : null;

  // 本文に着信日時があればそれを使う（メールの受信時刻は数分遅れることがある）
  let inquiredAt = new Date(email.date).toISOString();
  const received = new Date(email.date).getTime();
  const full = body.match(/(20\d{2})[/年.-](\d{1,2})[/月.-](\d{1,2})日?(?:\s*\([^)]*\))?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (full) {
    const candidate = jstIso(Number(full[1]), Number(full[2]), Number(full[3]), Number(full[4]), Number(full[5]), Number(full[6] || 0));
    const diff = received - new Date(candidate).getTime();
    if (diff >= -10 * 60_000 && diff <= 2 * 24 * 60 * 60_000) inquiredAt = candidate;
  }

  const statusLine = body.match(/転送結果\s*:\s*([^\n]+)/)?.[1]
    || body.split("\n").find((line) => /(正常終了|応答なし|不在|話し中|留守|録音)/.test(line));
  const callStatus = statusLine ? statusLine.trim().slice(0, 80) : null;

  const lines = body.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/https?:\/\//.test(line) && !/^[━─=＝\-_*■□◆◇・]+$/.test(line));
  const labeled = lines.filter((line) => /:/.test(line)).slice(0, 6);
  const memoLines = labeled.length ? labeled : lines.slice(0, 3);
  const memo = memoLines.length ? memoLines.join("／").slice(0, 300) : null;

  return { callerNumber, inquiredAt, callStatus, memo };
}

// 「9月8日集計分」の年を受信日から決める（1月に届いた12月分は前年）
export function estamaReportDate(subject: string, receivedIso: string) {
  const match = normalizeText(subject).match(/(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const received = jstParts(receivedIso);
  const year = month > received.month ? received.year - 1 : received.year;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// ラベルの付いた数値を本文から探す。値がラベルの次の行にある書式にも対応する
function findLabeledNumber(lines: string[], label: RegExp, exclude?: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!label.test(line) || (exclude && exclude.test(line))) continue;
    const labelEnd = line.search(label) + (line.match(label)?.[0].length || 0);
    const sameLine = line.slice(labelEnd).match(/(\d+)/);
    if (sameLine) return Number(sameLine[1]);
    const next = lines.slice(index + 1).find((candidate) => candidate.trim());
    const nextNumber = next?.trim().match(/^(\d+)/);
    if (nextNumber) return Number(nextNumber[1]);
  }
  return null;
}

export function parseEstamaDailyReport(email: ReportEmail): EstamaDailyReport | { error: string } {
  const reportDate = estamaReportDate(email.subject, email.date);
  if (!reportDate) return { error: "件名から集計日を読み取れません" };
  const body = normalizeText(email.body || "");
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);

  const pageViews = findLabeledNumber(lines, /(?:店舗|ショップ|お店).{0,12}?(?:アクセス|閲覧|PV|ページビュー)(?:数)?/)
    ?? findLabeledNumber(lines, /(?:アクセス|閲覧|PV|ページビュー)(?:数)?/, /セラピスト|写メ|日記|クーポン|ランキング/);
  const inquiryCount = findLabeledNumber(lines, /(?:お?問い?合わ?せ|お?問合せ)(?:数|件数)?/)
    ?? findLabeledNumber(lines, /予約(?:数|件数)/);
  if (pageViews === null) return { error: "本文からアクセス数を読み取れません" };
  if (inquiryCount === null) return { error: "本文から問い合わせ数を読み取れません" };

  const externalStoreId = body.match(/estama\.jp\/(?:admin\/)?shop\/(\d+)/)?.[1] || null;
  return { reportDate, pageViews, inquiryCount, externalStoreId };
}
