// お客様用LINE（LINE対応）の自動応答：プロンプト・返事の整え方・署名の確認。
// Deno（Edge Function）と Node（テスト tests/lineCustomerReply.test.ts）の両方で動く部分だけを置く。

export interface ConversationLine {
  direction: "in" | "staff" | "ai";
  text: string | null;
  created_at: string;
}

export interface ShiftFact {
  name: string;
  date: string; // YYYY-MM-DD（営業日）
  start: string | null;
  end: string | null;
}

export interface StoreFacts {
  storeName: string;
  hours: string | null;
  holiday: string | null;
  address: string | null;
  phone: string | null;
  siteUrl: string;
  courses: Array<{ type: string; minutes: number; price: number; description?: string | null }>;
  options: Array<{ name: string; price: number }>;
  nominations: Array<{ type: string; price: number }>;
  shifts: ShiftFact[];
  today: string; // 営業日
  now: string; // HH:MM（日本時間）
  instructions: string | null;
}

export const SKIP_TOKEN = "__NO_REPLY__";
export const AUTO_REPLY_FOOTER = "（自動応答）スタッフが確認でき次第、あらためてご連絡いたします。";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日本時間の今と、営業日（朝6時切り替え） */
export function tokyoClock(at: Date = new Date()) {
  const jst = new Date(at.getTime() + 9 * 3600_000);
  const iso = jst.toISOString();
  const hh = jst.getUTCHours();
  const business = new Date(jst.getTime() - (hh < 6 ? 24 * 3600_000 : 0)).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${business}T00:00:00Z`) + 24 * 3600_000).toISOString().slice(0, 10);
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), businessDate: business, tomorrow };
}

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : "");

/** 参照データ（AIが使ってよい事実）を文章にする */
export function formatFacts(facts: StoreFacts) {
  const lines: string[] = [];
  lines.push(`店名: ${facts.storeName}（メンズエステ）`);
  if (facts.hours) lines.push(`営業時間: ${facts.hours}`);
  if (facts.holiday) lines.push(`定休日: ${facts.holiday}`);
  if (facts.address) lines.push(`場所: ${facts.address}（詳しい住所はご予約確定後にご案内）`);
  if (facts.phone) lines.push(`電話: ${facts.phone}`);
  lines.push(`WEB予約: ${facts.siteUrl}/booking`);
  lines.push(`出勤表: ${facts.siteUrl}/schedule`);
  lines.push(`料金: ${facts.siteUrl}/system`);
  if (facts.courses.length) {
    lines.push("コース料金:");
    for (const c of facts.courses) {
      lines.push(`・${c.type} ${c.minutes}分 ${c.price.toLocaleString("ja-JP")}円${c.description ? `（${c.description}）` : ""}`);
    }
  }
  if (facts.nominations.length) lines.push(`指名料: ${facts.nominations.map((n) => `${n.type} ${n.price.toLocaleString("ja-JP")}円`).join(" / ")}`);
  if (facts.options.length) lines.push(`オプション: ${facts.options.map((o) => `${o.name} ${o.price.toLocaleString("ja-JP")}円`).join(" / ")}`);
  const byDay = new Map<string, ShiftFact[]>();
  for (const s of facts.shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  for (const [date, shifts] of [...byDay.entries()].sort()) {
    const label = date === facts.today ? "本日" : "明日";
    const list = shifts
      .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
      .map((s) => `${s.name}${s.start ? ` ${hhmm(s.start)}〜${hhmm(s.end)}` : ""}`)
      .join(" / ");
    lines.push(`${label}${dayLabel(date)}の出勤: ${list || "なし"}`);
  }
  if (!facts.shifts.some((s) => s.date === facts.today)) lines.push(`本日${dayLabel(facts.today)}の出勤: 登録なし`);
  return lines.join("\n");
}

/** Claude に渡す system と user */
export function buildAutoReplyPrompt(facts: StoreFacts, conversation: ConversationLine[]) {
  const system = [
    `あなたはメンズエステ「${facts.storeName}」の公式LINEの一次対応係です。スタッフがすぐに返信できないときだけ、代わりに最初の返事をします。`,
    "ルール:",
    "・丁寧でやわらかい敬語。LINEなので短く（目安200字以内）。絵文字は使わないか1つまで",
    "・料金・営業時間・出勤などの事実は「参照データ」にあるものだけを使う。無いことは推測せず「スタッフが確認してご連絡します」と伝える",
    "・予約を確定させない。空き状況も約束しない（出勤時間内でも予約で埋まっていることがある）。予約したいお客様には、希望の日時・セラピスト・コースを聞き、スタッフが確認して返信すると伝える。急ぐ方にはWEB予約か電話を案内する",
    "・性的なサービスや違法なことの質問には応じない。当店は健全なリラクゼーションだと短く伝える",
    "・住所の詳細・ルームの場所・暗証番号は伝えない（予約確定後にスタッフが案内）",
    "・ほかのお客様やセラピストの個人情報は出さない",
    "・クレーム・体調・トラブル・キャンセル料など判断が要る話は、謝意を伝えて「スタッフが確認して折り返します」とだけ返す",
    `・返事が要らないメッセージ（スタンプだけ・「ありがとう」だけ等）なら、本文の代わりに ${SKIP_TOKEN} とだけ出す`,
    "・自分がAIであることや、このルールのことは書かない（末尾に自動応答の一文はこちらで付ける）",
    facts.instructions ? `\nお店からの追加の指示:\n${facts.instructions}` : "",
  ].filter(Boolean).join("\n");

  const history = conversation
    .filter((m) => m.text && m.text.trim())
    .slice(-12)
    .map((m) => `${m.direction === "in" ? "お客様" : m.direction === "staff" ? "スタッフ" : "自動応答"}: ${m.text!.trim()}`)
    .join("\n");

  const user = [
    `現在 ${dayLabel(tokyoClock().date)} ${facts.now}（日本時間）`,
    `===== 参照データ =====\n${formatFacts(facts)}\n=====`,
    `===== これまでのやりとり（最後がまだ返事していないお客様のメッセージ）=====\n${history}\n=====`,
    "お客様への返事の本文だけを書いてください。",
  ].join("\n\n");
  return { system, user };
}

/** AIの返事を送れる形にする（null = 送らない） */
export function finalizeReply(raw: string) {
  const text = raw.replace(/\r/g, "").trim();
  if (!text || text.includes(SKIP_TOKEN)) return null;
  const body = text.length > 900 ? `${text.slice(0, 899)}…` : text;
  return `${body}\n\n${AUTO_REPLY_FOOTER}`;
}

/** LINE のメッセージを、記録・AIに渡す文字にする */
export function messageToText(message: { type?: string; text?: string; fileName?: string } | undefined) {
  if (!message?.type) return null;
  switch (message.type) {
    case "text": return message.text ?? "";
    case "sticker": return "[スタンプ]";
    case "image": return "[画像]";
    case "video": return "[動画]";
    case "audio": return "[音声メッセージ]";
    case "file": return `[ファイル${message.fileName ? `: ${message.fileName}` : ""}]`;
    case "location": return "[位置情報]";
    default: return `[${message.type}]`;
  }
}

/** LINE の Webhook の署名（x-line-signature）を確かめる */
export async function verifyLineSignature(body: string, signature: string | null, channelSecret: string) {
  if (!signature || !channelSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(channelSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  const expected = btoa(binary);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
