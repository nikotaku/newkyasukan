/**
 * X運用表「今日の投稿」：運用表の1日の投稿スケジュール（時間・投稿タイプ）に、その日の出勤・空き枠・イベント・口コミを
 * 流し込んで、そのまま貼れる投稿文を作る。データで作れない投稿（求人・店長など）は AI で作る（needsAi）。
 */
import { findNextAvailableStart, formatAvailabilityTime } from "./availability.ts";
import type { XAccountPlan, XDailyRow } from "./xOperationsPlan.ts";

export interface XCast {
  id: string;
  name: string;
  photo: string | null;
  start: string; // HH:MM
  end: string;
  nextAvailable: string | null; // その時点で一番早く案内できる時刻
  bookingUrl: string;
  intro: string | null;
}

export interface XPostContext {
  date: string; // 営業日 YYYY-MM-DD
  isToday: boolean; // 表示している日が今日の営業日か（空き枠の書き方が変わる）
  nowLabel: string; // 「18:10」など、空き枠を数えた時刻
  storeName: string;
  siteUrl: string;
  phoneDisplay: string | null;
  today: XCast[];
  tomorrow: XCast[];
  discounts: Array<{ name: string; label: string }>;
  reviews: Array<{ therapistName: string | null; text: string; rating: number | null }>;
}

export type XPostKind = "today_shift" | "tomorrow_shift" | "pickup" | "slots" | "event" | "last_slot" | "review" | "ai";
export type XImageKind = "shift_today" | "shift_tomorrow" | "pickup" | "slots" | "event" | "quote";

export interface XDailyPost {
  slotKey: string;
  accountKey: string;
  accountName: string;
  time: string;
  type: string;
  kind: XPostKind;
  text: string;
  imageKind: XImageKind;
  pickup: XCast | null;
  // 出勤が未登録などで、いつもの内容を作れなかったときの注意
  warning: string | null;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// 営業日は朝6時で切り替わる（0:00〜5:59は前の日の深夜営業）
export function businessDate(now: Date) {
  const tokyo = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000);
  return tokyo.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

const toMinutesOfDay = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/**
 * 公開サイトの「最短◯時〜」と同じ考え方で、そのセラピストに次に案内できる時刻を出す。
 * nowMinutes が null のとき（今日以外の日）は出勤開始から数える。日をまたぐ出勤は24時以降として扱う。
 */
export function nextAvailableFor(
  shift: { start: string; end: string },
  reservations: Array<{ start_time: string; duration: number }>,
  intervalMinutes: number,
  nowMinutes: number | null,
) {
  const start = toMinutesOfDay(shift.start);
  const endRaw = toMinutesOfDay(shift.end);
  const end = endRaw <= start ? endRaw + 24 * 60 : endRaw;
  let current = nowMinutes ?? start;
  if (nowMinutes !== null && endRaw <= start && nowMinutes < endRaw) current += 24 * 60;
  const found = findNextAvailableStart({
    shiftStart: start,
    shiftEnd: end,
    currentTime: current,
    reservations: reservations.map((reservation) => {
      const raw = toMinutesOfDay(reservation.start_time);
      return { start: raw < start ? raw + 24 * 60 : raw, duration: reservation.duration };
    }),
    intervalMinutes,
  });
  return found === null ? null : formatAvailabilityTime(found);
}

// 同じ時間・投稿タイプの行は同じ投稿として扱う（チェックや手直しの紐付け先）
export const slotKeyOf = (row: Pick<XDailyRow, "time" | "type">) => `${row.time.trim()}|${row.type.trim()}`;

export function classifyPost(account: Pick<XAccountPlan, "key">, row: Pick<XDailyRow, "type" | "content">): XPostKind {
  const label = `${row.type} ${row.content}`;
  // 求人・店長アカウントの投稿は、お客様向けのデータでは作らない
  if (account.key !== "shukyaku") return "ai";
  if (/明日/.test(row.type) && /出勤/.test(row.type)) return "tomorrow_shift";
  if (/出勤/.test(row.type)) return "today_shift";
  if (/空き/.test(row.type)) return "slots";
  if (/紹介|ピックアップ/.test(row.type)) return "pickup";
  if (/イベント|割引|キャンペーン|クーポン/.test(row.type)) return "event";
  if (/直前|ラスト/.test(label)) return "last_slot";
  if (/口コミ/.test(row.type)) return "review";
  return "ai";
}

// X の文字数（全角は2、URLは23として数える。上限280）
export const X_MAX_WEIGHT = 280;
export function xWeightedLength(text: string) {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlPattern) ?? [];
  const rest = text.replace(urlPattern, "");
  let weight = urls.length * 23;
  for (const char of rest) {
    const code = char.codePointAt(0) ?? 0;
    const light =
      code <= 0x10ff ||
      (code >= 0x2000 && code <= 0x200d) ||
      (code >= 0x2010 && code <= 0x201f) ||
      (code >= 0x2032 && code <= 0x2037);
    weight += light ? 1 : 2;
  }
  return weight;
}

const shortTime = (time: string) => time.slice(0, 5);

// 280を超えないように、並べる人数を減らして「ほか◯名」にまとめる
function fitList(head: string[], lines: string[], tail: string[]) {
  for (let count = lines.length; count >= 1; count -= 1) {
    const shown = lines.slice(0, count);
    if (count < lines.length) shown.push(`ほか${lines.length - count}名`);
    const text = [...head, ...shown, ...tail].join("\n");
    if (xWeightedLength(text) <= X_MAX_WEIGHT) return text;
  }
  return [...head, ...tail].join("\n");
}

// 同じ日なら同じ人を選ぶ（開き直しても変わらない）
function pickFor(date: string, casts: XCast[]) {
  if (!casts.length) return null;
  const withSlot = casts.filter((c) => c.nextAvailable);
  const pool = withSlot.length ? withSlot : casts;
  let hash = 0;
  for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length];
}

function firstSentence(text: string | null, max = 60) {
  if (!text) return null;
  const line = text.replace(/\s+/g, " ").trim().split(/(?<=[。！!？?])/)[0]?.trim() ?? "";
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function buildShift(ctx: XPostContext, casts: XCast[], tomorrow: boolean) {
  const date = tomorrow ? shiftDate(ctx.date, 1) : ctx.date;
  const head = [`【${tomorrow ? "明日" : "本日"}の出勤】${dayLabel(date)}`];
  const tail = [tomorrow ? "事前予約で確実にご案内できます" : "ご予約はこちら▶︎", `${ctx.siteUrl}/schedule`];
  if (!casts.length) {
    return {
      text: [...head, "出勤情報は準備中です", `${ctx.siteUrl}/schedule`].join("\n"),
      warning: `${tomorrow ? "明日" : "今日"}の出勤がまだ登録されていません`,
    };
  }
  return { text: fitList(head, casts.map((c) => `${c.name} ${shortTime(c.start)}〜`), tail), warning: null };
}

function buildSlots(ctx: XPostContext) {
  const open = ctx.today.filter((c) => c.nextAvailable).sort((a, b) => a.nextAvailable!.localeCompare(b.nextAvailable!));
  if (!open.length) {
    return {
      text: ["【満員御礼】", `${dayLabel(ctx.date)}は全枠ご予約いただきました🙏`, "明日の出勤・ご予約はこちら▶︎", `${ctx.siteUrl}/schedule`].join("\n"),
      warning: ctx.today.length ? "今日の空き枠はありません（満員御礼の文にしています）" : "今日の出勤がまだ登録されていません",
    };
  }
  const head = [ctx.isToday ? `【空き枠速報】${ctx.nowLabel}時点` : `【空き状況】${dayLabel(ctx.date)}`];
  const lines = open.map((c) => `${c.name} ${c.nextAvailable}〜ご案内可能`);
  return { text: fitList(head, lines, ["お早めに▶︎", `${ctx.siteUrl}/schedule`]), warning: null };
}

function buildPickup(ctx: XPostContext) {
  const cast = pickFor(ctx.date, ctx.today);
  if (!cast) return { text: "", warning: "今日の出勤がまだ登録されていません", cast: null };
  const intro = firstSentence(cast.intro);
  const time = cast.nextAvailable ?? shortTime(cast.start);
  const text = [
    `本日出勤の${cast.name}さん🌙`,
    ...(intro ? [intro] : []),
    `本日${time}〜ご案内可能です`,
    `ご予約▶︎ ${cast.bookingUrl}`,
  ].join("\n");
  return { text, warning: cast.nextAvailable ? null : "空き枠がないため、出勤時刻で案内しています", cast };
}

function buildEvent(ctx: XPostContext) {
  const top = ctx.discounts[0];
  if (!top) return null;
  const text = ["【開催中】", top.name, top.label, "詳しくはこちら▶︎", `${ctx.siteUrl}/campaigns`].join("\n");
  return text;
}

function buildLastSlot(ctx: XPostContext) {
  const open = ctx.today.filter((c) => c.nextAvailable);
  if (!open.length) return null;
  // 一番遅く案内できる枠（深夜は24時以降として比べる）
  const minutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h < 6 ? h + 24 : h) * 60 + m;
  };
  const last = [...open].sort((a, b) => minutes(b.nextAvailable!) - minutes(a.nextAvailable!))[0];
  return [
    `本日ラスト枠 ${last.nextAvailable}〜`,
    `${last.name}さん ご案内可能です`,
    ctx.phoneDisplay ? `お電話が一番早いです📞 ${ctx.phoneDisplay}` : "ご予約はお早めに",
    `${ctx.siteUrl}/schedule`,
  ].join("\n");
}

function buildReview(ctx: XPostContext) {
  const review = ctx.reviews.find((r) => r.text.trim());
  if (!review) return null;
  const excerpt = review.text.replace(/\s+/g, " ").trim();
  const head = [`【お客様の声】${review.therapistName ? `${review.therapistName}さん` : ""}${review.rating ? ` ★${review.rating}` : ""}`];
  const tail = ["ご来店ありがとうございました🌙", `${ctx.siteUrl}/voice`];
  for (let length = Math.min(excerpt.length, 90); length >= 20; length -= 10) {
    const quoted = `「${excerpt.length > length ? `${excerpt.slice(0, length)}…` : excerpt}」`;
    const text = [...head, quoted, ...tail].join("\n");
    if (xWeightedLength(text) <= X_MAX_WEIGHT) return text;
  }
  return [...head, ...tail].join("\n");
}

const IMAGE_BY_KIND: Record<XPostKind, XImageKind> = {
  today_shift: "shift_today",
  tomorrow_shift: "shift_tomorrow",
  pickup: "pickup",
  slots: "slots",
  event: "event",
  last_slot: "slots",
  review: "quote",
  ai: "quote",
};

export function buildDailyPosts(accounts: XAccountPlan[], ctx: XPostContext): XDailyPost[] {
  const posts: XDailyPost[] = [];
  for (const account of accounts) {
    for (const row of account.daily) {
      if (!row.time.trim() && !row.type.trim()) continue;
      let kind = classifyPost(account, row);
      let text = "";
      let warning: string | null = null;
      let pickup: XCast | null = null;

      if (kind === "today_shift" || kind === "tomorrow_shift") {
        ({ text, warning } = buildShift(ctx, kind === "tomorrow_shift" ? ctx.tomorrow : ctx.today, kind === "tomorrow_shift"));
      } else if (kind === "slots") {
        ({ text, warning } = buildSlots(ctx));
      } else if (kind === "pickup") {
        const result = buildPickup(ctx);
        ({ text, warning } = result);
        pickup = result.cast;
        if (!pickup) kind = "ai";
      } else if (kind === "event") {
        const event = buildEvent(ctx);
        if (event) text = event;
        else {
          kind = "ai";
          warning = "有効なイベント・割引がないので、AIで作ります";
        }
      } else if (kind === "last_slot") {
        const last = buildLastSlot(ctx) ?? buildReview(ctx);
        if (last) text = last;
        else kind = "ai";
      } else if (kind === "review") {
        const review = buildReview(ctx);
        if (review) text = review;
        else kind = "ai";
      }

      posts.push({
        slotKey: slotKeyOf(row),
        accountKey: account.key,
        accountName: account.name,
        time: row.time,
        type: row.type,
        kind,
        text,
        imageKind: IMAGE_BY_KIND[kind],
        pickup,
        warning,
      });
    }
  }
  const minutes = (t: string) => {
    const match = t.match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
  };
  return posts.sort((a, b) => minutes(a.time) - minutes(b.time));
}

// AI に渡す材料（創作させないための事実）
export function buildAiFacts(ctx: XPostContext) {
  const lines = [`店名: ${ctx.storeName}`, `日付: ${dayLabel(ctx.date)}`];
  if (ctx.today.length) lines.push(`本日の出勤: ${ctx.today.map((c) => `${c.name}(${shortTime(c.start)}〜)`).join("、")}`);
  if (ctx.discounts.length) lines.push(`開催中の割引: ${ctx.discounts.map((d) => `${d.name}（${d.label}）`).join("、")}`);
  lines.push(`予約ページ: ${ctx.siteUrl}/schedule`, `求人ページ: ${ctx.siteUrl}/recruit-talk`);
  return lines.join("\n");
}
