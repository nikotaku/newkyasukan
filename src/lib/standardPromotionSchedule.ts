export type PromotionChannelKey =
  | "hp_top_banner"
  | "estama_top_banner"
  | "x_post"
  | "o2_post"
  | "o2_story"
  | "line_official";

export type GeneratedPromotionSchedule = {
  title: string;
  description: string;
  preparation: Array<{ label: string }>;
  posting: Array<{
    scheduled_on: string;
    group_label: string;
    items: Array<{ channel_key: PromotionChannelKey; label: string }>;
  }>;
};

type StandardPromotionInput = {
  therapistNames: string[];
  startsOn: string;
  endsOn: string;
  channels: Array<{
    key: PromotionChannelKey;
    label: string;
    count: number;
    sizeSpec: string;
  }>;
  goal?: string;
};

const DAY_MS = 86_400_000;
const CHANNEL_LABELS: Record<PromotionChannelKey, string> = {
  hp_top_banner: "HPトップバナー",
  estama_top_banner: "エステ魂トップバナー",
  x_post: "X投稿",
  o2_post: "02投稿",
  o2_story: "02ストーリー",
  line_official: "LINE公式アカウントでの宣伝",
};
const PHASES = [
  { theme: "初回告知・ティザー公開", material: "ティザー素材（動画①・写真①・ニュース①）" },
  { theme: "中盤告知・魅力紹介", material: "中盤素材（動画②・写真②・ニュース②）" },
  { theme: "最終告知・予約案内", material: "最終素材（動画③・写真③・ニュース③）" },
];

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Keep the length limit without cutting an emoji's UTF-16 surrogate pair.
  let end = max - 1;
  if (/[\uD800-\uDBFF]/.test(value.charAt(end - 1))) end -= 1;
  return `${value.slice(0, end)}…`;
}

function parseDate(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    throw new Error("日付は有効なYYYY-MM-DD形式で入力してください");
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);
  // Date.parse normalizes some impossible dates, so validate the UTC round trip too.
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error("日付は有効なYYYY-MM-DD形式で入力してください");
  }
  return time;
}

function phaseAt(progress: number) {
  return PHASES[Math.min(2, Math.floor(progress * 3))];
}

/** Enabled channels only. No I/O, clock, randomness, or AI; equal inputs produce equal outputs. */
export function buildStandardPromotionSchedule(input: StandardPromotionInput): GeneratedPromotionSchedule {
  if (!input || !Array.isArray(input.therapistNames) || input.therapistNames.length === 0 ||
      Array.from(input.therapistNames).some((name) => typeof name !== "string" || !name.trim())) {
    throw new Error("セラピスト名を1名以上指定してください（空の名前は使えません）");
  }
  const start = parseDate(input.startsOn);
  const end = parseDate(input.endsOn);
  const periodDays = (end - start) / DAY_MS + 1;
  if (periodDays < 1) throw new Error("終了日は開始日以降にしてください");
  if (periodDays > 60) throw new Error("作成期間は60日以内にしてください");
  if (!Array.isArray(input.channels) || input.channels.length === 0) {
    throw new Error("宣伝先を1つ以上指定してください");
  }
  const seen = new Set<PromotionChannelKey>();
  let total = 0;
  for (const channel of input.channels) {
    if (!channel || typeof channel.key !== "string" ||
        !Object.prototype.hasOwnProperty.call(CHANNEL_LABELS, channel.key)) {
      throw new Error("未対応の宣伝先です");
    }
    if (seen.has(channel.key)) throw new Error("宣伝先が重複しています");
    seen.add(channel.key);
    if (!Number.isInteger(channel.count) || channel.count < 1 || channel.count > 30) {
      throw new Error("掲載数・回数は1〜30の整数で指定してください");
    }
    if (typeof channel.label !== "string" || typeof channel.sizeSpec !== "string") {
      throw new Error("宣伝先のラベルとサイズ・仕様は文字列で指定してください");
    }
    total += channel.count;
  }
  if (total > 100) throw new Error("掲載数・回数の合計は100以内にしてください");
  if (input.goal !== undefined && typeof input.goal !== "string") {
    throw new Error("目標メモは文字列で指定してください");
  }

  const names = input.therapistNames.map((name) => compact(name));
  const nameSummary = names.slice(0, 3).map((name) => truncate(name, 16)).join("・") +
    (names.length > 3 ? `ほか${names.length - 3}名` : "");
  const postingNames = truncate(nameSummary, 32);
  const photoLabel = names.length >= 2 ? "2ショット宣材写真" : "告知用宣材写真";
  const goal = input.goal?.trim();
  const description = "標準スケジュール（AI未使用）。指定した期間・宣伝先・回数をもとに均等配置しています。" +
    (goal ? `\n目標メモ：${truncate(goal, 500)}` : "");
  const groups = new Map<string, GeneratedPromotionSchedule["posting"][number]>();

  input.channels.forEach((channel, channelIndex) => {
    const channelLabel = CHANNEL_LABELS[channel.key];
    const sizeSpec = compact(channel.sizeSpec);
    for (let index = 0; index < channel.count; index += 1) {
      // Repeated dates are intentional: never deduplicate placements on short periods.
      const progress = channel.count > 1
        ? index / (channel.count - 1)
        : channelIndex / Math.max(1, input.channels.length - 1);
      const offset = Math.round(progress * (periodDays - 1));
      const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
      let group = groups.get(date);
      if (!group) {
        group = {
          scheduled_on: date,
          group_label: periodDays === 1
            ? "当日集中告知（ティザー・中盤・最終）"
            : phaseAt(offset / (periodDays - 1)).theme,
          items: [],
        };
        groups.set(date, group);
      }
      const material = channel.key === "hp_top_banner" || channel.key === "estama_top_banner"
        ? "告知バナー／" : "";
      const label = `${channelLabel}：${postingNames} ${index + 1}/${channel.count}回目 ` +
        `${material}${phaseAt(progress).material}`;
      // The specification has its own UI limit; do not spend it on the channel/name prefix.
      group.items.push({
        channel_key: channel.key,
        label: sizeSpec ? `${label}／仕様：${truncate(sizeSpec, 120)}` : label,
      });
    }
  });

  return {
    title: truncate(`${nameSummary}の標準宣伝スケジュール`, 80),
    description,
    preparation: [
      { label: "ショート動画 3本（各5秒／ティザー・中盤・最終で使い分け）" },
      { label: `${photoLabel} 3パターン（ティザー・中盤・最終で分散使用）` },
      { label: "告知バナー 1点（横長／X・エステ魂ヘッダー想定）" },
      { label: "ニュース① 原稿（ティザー・初回告知用）" },
      { label: "ニュース② 原稿（中盤・魅力紹介用）" },
      { label: "ニュース③ 原稿（最終・予約案内用）" },
    ],
    posting: [...groups.values()].sort((a, b) => a.scheduled_on < b.scheduled_on ? -1 : a.scheduled_on > b.scheduled_on ? 1 : 0),
  };
}
