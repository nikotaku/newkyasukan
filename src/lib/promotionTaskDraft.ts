// 宣伝の企画スケジュールのタスクから、AIに投稿文を書いてもらうための材料（generate-cast-content の x_post）を作る。
// タスクの種類の見分け方はDBの private.promotion_task_kind と同じ（ラベルの「：」より前を見る）。
// テスト: npm run test:promotion-task

export type PromotionTaskKind = "store_x" | "self_x" | "store_o2" | "self_o2" | "o2_story" | "hp_news" | "estama_news" | "manual";

export function promotionTaskKind(label: string | null | undefined, channelKey: string | null | undefined): PromotionTaskKind {
  const text = label ?? "";
  const prefix = text.replace(/：/g, ":").split(":")[0];
  if (/ストーリー/.test(prefix) || channelKey === "o2_story") return "o2_story";
  if (/(0|０|O|Ｏ)2/.test(prefix)) return /店舗/.test(prefix) ? "store_o2" : "self_o2";
  if (/[XＸ]/.test(prefix)) return /本人/.test(prefix) ? "self_x" : "store_x";
  if (/(エステ魂|エスたま|魂).{0,6}ニュース/.test(text)) return "estama_news";
  if (/HP.{0,6}ニュース/.test(text) || channelKey === "hp_news") return "hp_news";
  if (channelKey === "o2_post") return "self_o2";
  if (channelKey === "x_post") return "store_x";
  return "manual";
}

/** 自動で「完了」を確かめられる種類（投稿の記録がDBに残るもの） */
export const AUTO_CHECKABLE: PromotionTaskKind[] = ["store_x", "store_o2", "self_o2", "hp_news", "estama_news"];

const VOICE: Record<PromotionTaskKind, { name: string; purpose: string; tone: string; type: string }> = {
  store_x: { name: "お店のX（集客）", purpose: "セラピストの魅力を伝えて予約につなげる", tone: "丁寧で親しみやすい。お店目線で紹介する", type: "X投稿" },
  self_x: { name: "セラピスト本人のX", purpose: "本人の言葉でファンを作り、予約につなげる", tone: "本人の一人称。やわらかく、絵文字は少し", type: "X投稿" },
  store_o2: { name: "お店のO2", purpose: "セラピストを紹介して予約につなげる", tone: "丁寧で親しみやすい。お店目線", type: "O2投稿" },
  self_o2: { name: "セラピスト本人のO2", purpose: "本人の近況と空き枠を伝えて予約につなげる", tone: "本人の一人称。日記のようにやわらかく", type: "O2投稿" },
  o2_story: { name: "O2ストーリー", purpose: "今日の空き枠をひと目で伝える", tone: "短く。1〜2行", type: "O2ストーリー" },
  hp_news: { name: "HPのニュース", purpose: "セラピストの出勤・紹介をお知らせする", tone: "丁寧。お店のお知らせとして", type: "HPニュース" },
  estama_news: { name: "エステ魂のニュース", purpose: "セラピストの出勤・紹介をお知らせする", tone: "丁寧。お店のお知らせとして", type: "ニュース" },
  manual: { name: "お店の告知", purpose: "セラピストを紹介して予約につなげる", tone: "丁寧で親しみやすい", type: "告知" },
};

export interface DraftFacts {
  storeName: string;
  therapists: Array<{ name: string; profile?: string | null; message?: string | null; bookingUrl?: string | null }>;
  date: string | null; // YYYY-MM-DD
  shifts: Array<{ name: string; start: string; end: string; breakText?: string; nextAvailable?: string | null }>;
  planTitle?: string | null;
  planDescription?: string | null;
}

const clip = (value: string | null | undefined, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** generate-cast-content（type: x_post）に渡す本文 */
export function buildDraftRequest(task: { label: string; channel_key: string | null; group_label?: string | null }, facts: DraftFacts) {
  const kind = promotionTaskKind(task.label, task.channel_key);
  const voice = VOICE[kind];
  const lines: string[] = [`店名：${facts.storeName}`];
  if (facts.planTitle) lines.push(`企画：${clip(facts.planTitle, 80)}${facts.planDescription ? `（${clip(facts.planDescription, 200)}）` : ""}`);
  for (const therapist of facts.therapists) {
    lines.push(`セラピスト：${therapist.name}`);
    if (therapist.profile) lines.push(`  紹介：${clip(therapist.profile, 200)}`);
    if (therapist.message) lines.push(`  本人のひとこと：${clip(therapist.message, 120)}`);
    if (therapist.bookingUrl) lines.push(`  予約URL：${therapist.bookingUrl}`);
  }
  if (facts.date) lines.push(`投稿日：${facts.date}`);
  if (facts.shifts.length) {
    lines.push("この日の出勤：");
    for (const shift of facts.shifts) {
      lines.push(`  ${shift.name} ${shift.start}〜${shift.end}${shift.breakText ? `（${shift.breakText}）` : ""}${shift.nextAvailable ? ` 最短${shift.nextAvailable}〜` : ""}`);
    }
  } else if (facts.date) {
    lines.push("この日の出勤：まだ登録なし（出勤時間は書かない）");
  }
  return {
    type: "x_post",
    xAccount: { name: voice.name, purpose: voice.purpose, target: "仙台のメンズエステに興味のある男性", tone: voice.tone },
    xSlot: { time: "", type: voice.type, content: task.label, example: "", goal: "予約につなげる" },
    xTheme: {},
    xRules: [
      "タスクの指示（内容）に書かれたことを1つの投稿にする",
      "動画・写真・バナーなど素材の指示はそのまま書かず、文章だけを書く",
      kind === "o2_story" ? "1〜2行で短く" : "予約URLがあれば最後に入れる",
    ],
    xFacts: lines.join("\n"),
  };
}
