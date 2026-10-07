/**
 * 宣伝ノルマ（/promotion-schedule の「今月の露出ノルマ」）。
 * セラピストごとに、その月の出勤日数に応じて「最低これだけは露出する」回数を媒体ごとに決め、実績と比べる。
 *   決まり   : promotion_quota_settings.config（無ければ DEFAULT_QUOTA_CONFIG）
 *   実績     : promotion_exposures（手で記録）＋ 企画の完了した投稿（promotion_plan_tasks）
 *              ＋ HPニュース（hp_articles に名前が出たもの）＋ X運用表で投稿したもの（x_daily_posts。出勤・空き枠のまとめは除く）
 *   予定     : 企画のまだ終わっていない投稿
 */
import { classifyPost } from "./xDailyPosts.ts";

export type QuotaChannelKey = "hp_top_banner" | "hp_news" | "x_post" | "o2_post" | "estama_news" | "estama_top_banner";

export interface QuotaChannel {
  key: QuotaChannelKey;
  label: string;
  short: string;
  newcomerOnly: boolean;
  auto: string | null; // 自動で数えるもの（画面の説明用）
}

export const QUOTA_CHANNELS: QuotaChannel[] = [
  { key: "hp_top_banner", label: "HPトップバナー", short: "HPバナー", newcomerOnly: true, auto: null },
  { key: "hp_news", label: "HPニュース", short: "HPニュース", newcomerOnly: false, auto: "HPのニュースに名前が出た記事" },
  { key: "x_post", label: "X投稿", short: "X", newcomerOnly: false, auto: "X運用表で投稿した紹介・口コミなど（出勤・空き枠のまとめは除く）" },
  { key: "o2_post", label: "O2投稿", short: "O2", newcomerOnly: false, auto: null },
  { key: "estama_news", label: "エスたまニュース", short: "魂ニュース", newcomerOnly: false, auto: null },
  { key: "estama_top_banner", label: "エスたまトップバナー", short: "魂バナー", newcomerOnly: false, auto: null },
];

export const QUOTA_CHANNEL_KEYS = QUOTA_CHANNELS.map((channel) => channel.key);

export type QuotaTargets = Record<QuotaChannelKey, number>;

export interface QuotaTier {
  minDays: number; // この日数以上出勤する月
  targets: QuotaTargets;
}

export interface QuotaConfig {
  tiers: QuotaTier[]; // minDays の小さい順
  newcomerDays: number; // 入店から何日を新人とするか
  newcomerBonus: QuotaTargets; // 新人月に上乗せする回数
}

const MAX_COUNT = 60;

export const emptyTargets = (): QuotaTargets => ({
  hp_top_banner: 0,
  hp_news: 0,
  x_post: 0,
  o2_post: 0,
  estama_news: 0,
  estama_top_banner: 0,
});

const targets = (values: Partial<QuotaTargets>): QuotaTargets => ({ ...emptyTargets(), ...values });

export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  tiers: [
    { minDays: 1, targets: targets({ x_post: 2, o2_post: 2, estama_news: 1 }) },
    { minDays: 5, targets: targets({ x_post: 4, o2_post: 4, hp_news: 1, estama_news: 1 }) },
    { minDays: 10, targets: targets({ x_post: 6, o2_post: 6, hp_news: 1, estama_news: 2, estama_top_banner: 1 }) },
    { minDays: 15, targets: targets({ x_post: 8, o2_post: 8, hp_news: 2, estama_news: 2, estama_top_banner: 1 }) },
  ],
  newcomerDays: 30,
  newcomerBonus: targets({ hp_top_banner: 1, hp_news: 1, x_post: 2, estama_news: 1, estama_top_banner: 1 }),
};

const clampCount = (value: unknown, max = MAX_COUNT) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), max) : 0;
};

const readTargets = (value: unknown, allowTopBanner: boolean): QuotaTargets => {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = emptyTargets();
  for (const key of QUOTA_CHANNEL_KEYS) {
    result[key] = clampCount(source[key]);
  }
  // HPトップバナーは新人だけ
  if (!allowTopBanner) result.hp_top_banner = 0;
  return result;
};

/** 保存された決まりを読む（壊れていれば既定の決まり） */
export function normalizeQuotaConfig(raw: unknown): QuotaConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_QUOTA_CONFIG;
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.tiers)) return DEFAULT_QUOTA_CONFIG;
  const seen = new Set<number>();
  const tiers = source.tiers
    .map((tier) => {
      const value = tier && typeof tier === "object" ? (tier as Record<string, unknown>) : {};
      return { minDays: clampCount(value.minDays, 31), targets: readTargets(value.targets, false) };
    })
    .filter((tier) => tier.minDays >= 1 && !seen.has(tier.minDays) && seen.add(tier.minDays))
    .sort((a, b) => a.minDays - b.minDays);
  if (tiers.length === 0) return DEFAULT_QUOTA_CONFIG;
  const newcomerDays = clampCount(source.newcomerDays, 90);
  return {
    tiers,
    newcomerDays: newcomerDays >= 1 ? newcomerDays : DEFAULT_QUOTA_CONFIG.newcomerDays,
    newcomerBonus: readTargets(source.newcomerBonus, true),
  };
}

/** 出勤日数に当てはまる段階（出勤なし・最初の段階より少なければ null） */
export function tierIndexFor(config: QuotaConfig, shiftDays: number) {
  let found = -1;
  config.tiers.forEach((tier, index) => {
    if (shiftDays >= tier.minDays) found = index;
  });
  return found >= 0 ? found : null;
}

export function tierLabel(config: QuotaConfig, index: number) {
  const tier = config.tiers[index];
  if (!tier) return "";
  const next = config.tiers[index + 1];
  if (!next) return `${tier.minDays}日以上`;
  if (next.minDays - 1 === tier.minDays) return `${tier.minDays}日`;
  return `${tier.minDays}〜${next.minDays - 1}日`;
}

// ---- 日付（YYYY-MM-DD / YYYY-MM の文字列で扱う） ----

const toUtc = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d || 1);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;

export const monthOf = (date: string) => date.slice(0, 7);

export function addMonths(month: string, offset: number) {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + offset, 1));
  return next.toISOString().slice(0, 7);
}

/** その月の初日と、翌月の初日 */
export function monthRange(month: string) {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

export const daysInMonth = (month: string) => {
  const { start, end } = monthRange(month);
  return Math.round((toUtc(end) - toUtc(start)) / DAY);
};

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 日時（ISO）を日本時間の日付にする */
export function tokyoDate(iso: string) {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 新人の期間（入店日から newcomerDays 日）と、新人の上乗せを付ける月。
 * 上乗せは1回だけで、新人の期間がいちばん長く入っている月に付く（同じなら先の月）。
 */
export function newcomerInfo(joinDate: string | null | undefined, newcomerDays: number) {
  if (!joinDate || !/^\d{4}-\d{2}-\d{2}/.test(joinDate)) return null;
  const start = toUtc(joinDate.slice(0, 10));
  const until = fromUtc(start + (Math.max(newcomerDays, 1) - 1) * DAY);
  // 新人の期間に入っている日を月ごとに数える
  const daysByMonth = new Map<string, number>();
  for (let day = start; fromUtc(day) <= until; day += DAY) {
    const month = monthOf(fromUtc(day));
    daysByMonth.set(month, (daysByMonth.get(month) ?? 0) + 1);
  }
  let bonusMonth = monthOf(joinDate);
  for (const [month, days] of daysByMonth) {
    if (days > (daysByMonth.get(bonusMonth) ?? 0)) bonusMonth = month;
  }
  return { joinDate: joinDate.slice(0, 10), until, bonusMonth };
}

/** その月に新人の期間が1日でも入っているか */
export function isNewcomerInMonth(info: ReturnType<typeof newcomerInfo>, month: string) {
  if (!info) return false;
  const { start, end } = monthRange(month);
  return info.joinDate < end && info.until >= start;
}

/** その月の必要回数（段階＋新人の上乗せ）。出勤がない月は0 */
export function requiredFor(config: QuotaConfig, shiftDays: number, newcomerBonusMonth: boolean): QuotaTargets {
  const index = tierIndexFor(config, shiftDays);
  const result = index === null ? emptyTargets() : { ...config.tiers[index].targets, hp_top_banner: 0 };
  if (newcomerBonusMonth && shiftDays > 0) {
    for (const key of QUOTA_CHANNEL_KEYS) result[key] += config.newcomerBonus[key];
  }
  return result;
}

/** 今日の時点で、月の必要回数のうち終わっているべき回数（日割り） */
export function expectedByNow(required: number, month: string, today: string) {
  const { start, end } = monthRange(month);
  if (today < start) return 0;
  if (today >= end) return required;
  const elapsed = Math.round((toUtc(today) - toUtc(start)) / DAY) + 1;
  return Math.floor((required * elapsed) / daysInMonth(month));
}

// ---- 名前で数える（HPニュース・X） ----

const cleanText = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}&]/gu, "");

/** セラピスト名の比べ方：絵文字・記号・空白を除く。ペア（りりか&ももか）は両方の名前でもよい */
export function castNameKeys(name: string) {
  const full = cleanText(name).replace(/&/g, "");
  const parts = cleanText(name).split("&").filter((part) => part.length >= 2);
  return { full, parts: parts.length >= 2 ? parts : [] };
}

const SHORT_NAME_SUFFIX = /^(さん|ちゃん|嬢|様)/;

const containsName = (text: string, name: string) => {
  if (name.length >= 3) return text.includes(name);
  if (name.length < 2) return false;
  // 2文字の名前（りの など）は、ほかの言葉の一部を拾わないよう「さん・ちゃん」付きか前後が文字でないときだけ
  let from = 0;
  while (true) {
    const index = text.indexOf(name, from);
    if (index < 0) return false;
    const before = text.slice(0, index);
    const after = text.slice(index + name.length);
    const beforeOk = !/\p{L}$/u.test(before);
    const afterOk = SHORT_NAME_SUFFIX.test(after) || !/^\p{L}/u.test(after);
    if (beforeOk && afterOk) return true;
    from = index + 1;
  }
};

/** 文にそのセラピストの名前が出ているか */
export function mentionsCast(text: string | null | undefined, name: string) {
  if (!text) return false;
  const { full, parts } = castNameKeys(name);
  // 記号は消すが、2文字の名前の前後を見たいので空白は「区切り」として残す
  const normalized = text.normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ");
  const joined = normalized.replace(/\s+/g, "");
  if (full.length >= 3 && joined.includes(full)) return true;
  if (full.length === 2 && containsName(normalized, full)) return true;
  return parts.length > 0 && parts.every((part) => (part.length >= 3 ? joined.includes(part) : containsName(normalized, part)));
}

// ---- 一覧を作る ----

export interface QuotaCastInput {
  id: string;
  name: string;
  join_date: string | null;
}

export interface QuotaShiftInput {
  cast_id: string | null;
  shift_date: string;
  status?: string | null;
  approval_status?: string | null;
}

export interface QuotaExposureInput {
  id: string;
  cast_id: string;
  channel_key: string;
  exposed_on: string;
  note?: string | null;
  url?: string | null;
  plan_id?: string | null;
}

export interface QuotaPlanInput {
  id: string;
  title: string;
  therapist_label?: string | null;
  cast_ids: string[] | null;
}

export interface QuotaPlanTaskInput {
  id: string;
  plan_id: string;
  task_type: string;
  channel_key: string | null;
  scheduled_on: string | null;
  is_completed: boolean;
  label: string;
}

export interface QuotaArticleInput {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
  is_published: boolean | null;
}

export interface QuotaXPostInput {
  post_date: string;
  account_key: string;
  slot_key: string;
  text: string | null;
  posted_text: string | null;
  posted_at: string | null;
  publish_status?: string | null;
  post_url?: string | null;
}

export type QuotaItemSource = "manual" | "plan" | "hp_news" | "x";

export interface QuotaItem {
  source: QuotaItemSource;
  date: string;
  label: string;
  url: string | null;
  exposureId: string | null;
  planId: string | null;
  planned: boolean; // 企画のまだ終わっていない投稿
}

export interface QuotaCell {
  channel: QuotaChannelKey;
  required: number;
  done: number;
  planned: number;
  expected: number; // 今日までに終わっているべき回数
  items: QuotaItem[];
}

export type QuotaStatus = "none" | "done" | "on_track" | "behind";

export interface QuotaRow {
  castId: string;
  name: string;
  shiftDays: number;
  tierIndex: number | null;
  tierLabel: string;
  newcomer: { until: string; bonusMonth: string; bonusThisMonth: boolean } | null;
  cells: Record<QuotaChannelKey, QuotaCell>;
  required: number;
  achieved: number; // 媒体ごとに必要回数までで数えた実績
  rate: number | null; // 0〜1（必要が0なら null）
  status: QuotaStatus;
  behind: QuotaChannelKey[];
}

export interface QuotaBoardInput {
  month: string; // YYYY-MM
  today: string; // 今日の営業日 YYYY-MM-DD
  config: QuotaConfig;
  casts: QuotaCastInput[];
  shifts: QuotaShiftInput[];
  exposures: QuotaExposureInput[];
  plans: QuotaPlanInput[];
  planTasks: QuotaPlanTaskInput[];
  articles: QuotaArticleInput[];
  xPosts: QuotaXPostInput[];
}

const CANCELLED_SHIFT = new Set(["cancelled", "canceled", "absent", "rejected"]);

/** その月の出勤日数（取り消し・却下を除く、同じ日は1日） */
export function countShiftDays(shifts: QuotaShiftInput[], castId: string, month: string) {
  const { start, end } = monthRange(month);
  const days = new Set<string>();
  for (const shift of shifts) {
    if (shift.cast_id !== castId) continue;
    if (shift.shift_date < start || shift.shift_date >= end) continue;
    if (CANCELLED_SHIFT.has(String(shift.status ?? "")) || shift.approval_status === "rejected") continue;
    days.add(shift.shift_date);
  }
  return days.size;
}

// 企画の宣伝先 → ノルマの媒体（O2ストーリーはO2に数える。LINE公式は対象外）
const PLAN_CHANNEL_TO_QUOTA: Record<string, QuotaChannelKey> = {
  hp_top_banner: "hp_top_banner",
  estama_top_banner: "estama_top_banner",
  x_post: "x_post",
  o2_post: "o2_post",
  o2_story: "o2_post",
};

/**
 * 企画の投稿がどの媒体か。宣伝先が空の古い企画は「店舗X：…」「本人02：…」のような見出しから読む
 */
export function planTaskChannel(task: Pick<QuotaPlanTaskInput, "channel_key" | "label">): QuotaChannelKey | null {
  if (task.channel_key) return PLAN_CHANNEL_TO_QUOTA[task.channel_key] ?? null;
  const label = task.label.normalize("NFKC");
  const head = label.split(/[:：]/)[0].slice(0, 12);
  if (/エスたま|エステ魂|魂/.test(head) && /ニュース/.test(label)) return "estama_news";
  if (/HP/i.test(head) && /ニュース/.test(label)) return "hp_news";
  if (/(^|[^A-Za-z])X|ツイート/.test(head)) return "x_post";
  if (/02|O2/i.test(head)) return "o2_post";
  return null;
}

// まとめて名前が並ぶ投稿（出勤・空き枠・直前枠）は、その人の宣伝としては数えない
const LIST_POST_KINDS = new Set(["today_shift", "tomorrow_shift", "slots", "last_slot"]);

export function xPostCountsAsPromotion(post: QuotaXPostInput) {
  if (post.account_key !== "shukyaku") return false;
  if (!post.posted_at && post.publish_status !== "posted") return false;
  const type = post.slot_key.split("|").slice(1).join("|");
  return !LIST_POST_KINDS.has(classifyPost({ key: post.account_key }, { type, content: "" }));
}

const isQuotaChannel = (value: string): value is QuotaChannelKey => (QUOTA_CHANNEL_KEYS as string[]).includes(value);

export function buildQuotaBoard(input: QuotaBoardInput): QuotaRow[] {
  const { month, today, config } = input;
  const { start, end } = monthRange(month);
  const inMonth = (date: string | null | undefined) => Boolean(date) && date! >= start && date! < end;
  const plansById = new Map(input.plans.map((plan) => [plan.id, plan]));

  const articles = input.articles
    .filter((article) => article.is_published !== false)
    .map((article) => ({ ...article, date: tokyoDate(article.created_at) }))
    .filter((article) => inMonth(article.date));
  const xPosts = input.xPosts.filter((post) => inMonth(post.post_date) && xPostCountsAsPromotion(post));

  return input.casts.map((cast) => {
    const shiftDays = countShiftDays(input.shifts, cast.id, month);
    const tierIndex = tierIndexFor(config, shiftDays);
    const info = newcomerInfo(cast.join_date, config.newcomerDays);
    const bonusThisMonth = Boolean(info && info.bonusMonth === month);
    const required = requiredFor(config, shiftDays, bonusThisMonth);
    const items: Record<QuotaChannelKey, QuotaItem[]> = {
      hp_top_banner: [], hp_news: [], x_post: [], o2_post: [], estama_news: [], estama_top_banner: [],
    };

    for (const exposure of input.exposures) {
      if (exposure.cast_id !== cast.id || !inMonth(exposure.exposed_on) || !isQuotaChannel(exposure.channel_key)) continue;
      const plan = exposure.plan_id ? plansById.get(exposure.plan_id) : null;
      items[exposure.channel_key].push({
        source: "manual",
        date: exposure.exposed_on,
        label: [exposure.note?.trim(), plan ? `企画：${plan.title}` : null].filter(Boolean).join(" ／ ") || "記録",
        url: exposure.url?.trim() || null,
        exposureId: exposure.id,
        planId: exposure.plan_id ?? null,
        planned: false,
      });
    }

    for (const task of input.planTasks) {
      if (task.task_type !== "posting" || !inMonth(task.scheduled_on)) continue;
      const channel = planTaskChannel(task);
      const plan = plansById.get(task.plan_id);
      if (!channel || !plan || !(plan.cast_ids ?? []).includes(cast.id)) continue;
      items[channel].push({
        source: "plan",
        date: task.scheduled_on!,
        label: `${plan.title}：${task.label}`,
        url: null,
        exposureId: null,
        planId: plan.id,
        planned: !task.is_completed,
      });
    }

    for (const article of articles) {
      if (!mentionsCast(`${article.title ?? ""}\n${article.content ?? ""}`, cast.name)) continue;
      items.hp_news.push({
        source: "hp_news",
        date: article.date,
        label: article.title?.trim() || "HPニュース",
        url: null,
        exposureId: null,
        planId: null,
        planned: false,
      });
    }

    for (const post of xPosts) {
      if (!mentionsCast(post.posted_text ?? post.text, cast.name)) continue;
      items.x_post.push({
        source: "x",
        date: post.post_date,
        label: `X運用表 ${post.slot_key.split("|").filter(Boolean).join(" ")}`,
        url: post.post_url ?? null,
        exposureId: null,
        planId: null,
        planned: false,
      });
    }

    const cells = {} as Record<QuotaChannelKey, QuotaCell>;
    let requiredTotal = 0;
    let achieved = 0;
    const behind: QuotaChannelKey[] = [];
    for (const key of QUOTA_CHANNEL_KEYS) {
      const list = items[key].sort((a, b) => a.date.localeCompare(b.date));
      const done = list.filter((item) => !item.planned).length;
      const planned = list.length - done;
      const expected = expectedByNow(required[key], month, today);
      cells[key] = { channel: key, required: required[key], done, planned, expected, items: list };
      requiredTotal += required[key];
      achieved += Math.min(done, required[key]);
      if (done < expected) behind.push(key);
    }

    const status: QuotaStatus = requiredTotal === 0
      ? "none"
      : achieved >= requiredTotal
        ? "done"
        : behind.length > 0
          ? "behind"
          : "on_track";

    return {
      castId: cast.id,
      name: cast.name,
      shiftDays,
      tierIndex,
      tierLabel: tierIndex === null ? "出勤なし" : tierLabel(config, tierIndex),
      newcomer: info && isNewcomerInMonth(info, month)
        ? { until: info.until, bonusMonth: info.bonusMonth, bonusThisMonth }
        : null,
      cells,
      required: requiredTotal,
      achieved,
      rate: requiredTotal > 0 ? achieved / requiredTotal : null,
      status,
      behind,
    };
  }).sort((a, b) => {
    // ノルマのある人を上に、出勤の多い順
    if ((a.required > 0) !== (b.required > 0)) return a.required > 0 ? -1 : 1;
    return b.shiftDays - a.shiftDays || a.name.localeCompare(b.name, "ja");
  });
}

export interface QuotaSummary {
  therapists: number; // ノルマのある人数
  completed: number; // 達成した人数
  behind: number; // 今日の時点で遅れている人数
  required: number;
  achieved: number;
  rate: number | null;
}

export function summarizeQuota(rows: QuotaRow[]): QuotaSummary {
  const active = rows.filter((row) => row.required > 0);
  const required = active.reduce((total, row) => total + row.required, 0);
  const achieved = active.reduce((total, row) => total + row.achieved, 0);
  return {
    therapists: active.length,
    completed: active.filter((row) => row.status === "done").length,
    behind: active.filter((row) => row.status === "behind").length,
    required,
    achieved,
    rate: required > 0 ? achieved / required : null,
  };
}
