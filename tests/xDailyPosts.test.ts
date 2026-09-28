import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyPosts,
  businessDate,
  classifyPost,
  nextAvailableFor,
  dayLabel,
  shiftDate,
  xWeightedLength,
  X_MAX_WEIGHT,
  type XCast,
  type XPostContext,
} from "../src/lib/xDailyPosts.ts";
import { DEFAULT_X_OPERATIONS_PLAN } from "../src/lib/xOperationsPlan.ts";

const cast = (name: string, start: string, nextAvailable: string | null, extra: Partial<XCast> = {}): XCast => ({
  id: name,
  name,
  photo: null,
  start,
  end: "23:00",
  nextAvailable,
  bookingUrl: `https://enka-salon.jp/r/${name}`,
  intro: null,
  ...extra,
});

const baseContext = (patch: Partial<XPostContext> = {}): XPostContext => ({
  date: "2026-09-28",
  isToday: true,
  nowLabel: "15:00",
  storeName: "艶華",
  siteUrl: "https://enka-salon.jp",
  phoneDisplay: "050-1785-6945",
  today: [cast("あさみ", "12:00", "18:00", { intro: "丁寧なリンパと会話の上手さで指名多数。休日はピラティス。" }), cast("ひなた", "15:00", "21:00")],
  tomorrow: [cast("のあ", "13:00", null), cast("れな", "18:00", null)],
  discounts: [{ name: "週末延長キャンペーン", label: "90分以上で15分延長無料" }],
  reviews: [{ therapistName: "あさみ", text: "とても丁寧で癒されました。また指名します！", rating: 5 }],
  ...patch,
});

const post = (posts: ReturnType<typeof buildDailyPosts>, account: string, type: RegExp) =>
  posts.find((p) => p.accountKey === account && type.test(p.type))!;

test("営業日は朝6時で切り替わる", () => {
  assert.equal(businessDate(new Date("2026-09-28T01:00:00+09:00")), "2026-09-27");
  assert.equal(businessDate(new Date("2026-09-28T06:00:00+09:00")), "2026-09-28");
  assert.equal(shiftDate("2026-09-30", 1), "2026-10-01");
  assert.equal(dayLabel("2026-09-28"), "9/28(月)");
});

test("Xの文字数は全角2・URL23で数える", () => {
  assert.equal(xWeightedLength("abc"), 3);
  assert.equal(xWeightedLength("本日"), 4);
  assert.equal(xWeightedLength("予約 https://enka-salon.jp/schedule"), 4 + 1 + 23);
});

test("集客アカウントの投稿タイプからデータの種類を決める", () => {
  const shukyaku = { key: "shukyaku" };
  assert.equal(classifyPost(shukyaku, { type: "本日の出勤", content: "" }), "today_shift");
  assert.equal(classifyPost(shukyaku, { type: "明日の出勤予告", content: "" }), "tomorrow_shift");
  assert.equal(classifyPost(shukyaku, { type: "空き枠速報", content: "" }), "slots");
  assert.equal(classifyPost(shukyaku, { type: "セラピスト紹介", content: "" }), "pickup");
  assert.equal(classifyPost(shukyaku, { type: "イベント・割引", content: "" }), "event");
  assert.equal(classifyPost(shukyaku, { type: "直前枠・口コミ", content: "ラスト枠の告知" }), "last_slot");
  // 求人・店長はAIで作る
  assert.equal(classifyPost({ key: "kyujin" }, { type: "給与実績", content: "" }), "ai");
  assert.equal(classifyPost({ key: "tencho" }, { type: "朝のひとこと", content: "" }), "ai");
});

test("初期の運用表から、今日の出勤・空き枠・紹介・イベント・明日の出勤を実データで作る", () => {
  const posts = buildDailyPosts(DEFAULT_X_OPERATIONS_PLAN.accounts, baseContext());
  const today = post(posts, "shukyaku", /本日の出勤/);
  assert.equal(today.text, "【本日の出勤】9/28(月)\nあさみ 12:00〜\nひなた 15:00〜\nご予約はこちら▶︎\nhttps://enka-salon.jp/schedule");
  assert.equal(today.imageKind, "shift_today");

  const slots = post(posts, "shukyaku", /空き枠/);
  assert.match(slots.text, /【空き枠速報】15:00時点\nあさみ 18:00〜ご案内可能\nひなた 21:00〜ご案内可能/);

  const pickup = post(posts, "shukyaku", /紹介/);
  assert.ok(pickup.pickup);
  assert.match(pickup.text, new RegExp(`本日出勤の${pickup.pickup!.name}さん`));
  assert.match(pickup.text, /ご予約▶︎ https:\/\/enka-salon\.jp\/r\//);

  assert.match(post(posts, "shukyaku", /イベント/).text, /週末延長キャンペーン\n90分以上で15分延長無料/);
  assert.match(post(posts, "shukyaku", /直前/).text, /本日ラスト枠 21:00〜\nひなたさん ご案内可能です\nお電話が一番早いです📞 050-1785-6945/);
  assert.match(post(posts, "shukyaku", /明日/).text, /【明日の出勤】9\/29\(火\)\nのあ 13:00〜\nれな 18:00〜/);

  // 求人・店長はAI
  assert.ok(posts.filter((p) => p.accountKey !== "shukyaku").every((p) => p.kind === "ai"));
  // 時間順
  const times = posts.map((p) => p.time);
  assert.equal(times[0], "8:00");
  // どれも280以内
  for (const p of posts) assert.ok(xWeightedLength(p.text) <= X_MAX_WEIGHT, `${p.type}: ${xWeightedLength(p.text)}`);
});

test("出勤が多い日は280を超えないよう「ほか◯名」にまとめる", () => {
  const many = Array.from({ length: 30 }, (_, i) => cast(`セラピスト${i + 1}番`, "12:00", "13:00"));
  const posts = buildDailyPosts(DEFAULT_X_OPERATIONS_PLAN.accounts, baseContext({ today: many }));
  const today = post(posts, "shukyaku", /本日の出勤/);
  assert.ok(xWeightedLength(today.text) <= X_MAX_WEIGHT);
  assert.match(today.text, /ほか\d+名/);
});

test("出勤なし・満員・割引なしのときは注意を出して、無理のない文にする", () => {
  const empty = buildDailyPosts(DEFAULT_X_OPERATIONS_PLAN.accounts, baseContext({ today: [], discounts: [], reviews: [] }));
  assert.equal(post(empty, "shukyaku", /本日の出勤/).warning, "今日の出勤がまだ登録されていません");
  assert.equal(post(empty, "shukyaku", /紹介/).kind, "ai");
  assert.equal(post(empty, "shukyaku", /イベント/).kind, "ai");
  assert.equal(post(empty, "shukyaku", /直前/).kind, "ai");

  const full = buildDailyPosts(DEFAULT_X_OPERATIONS_PLAN.accounts, baseContext({ today: [cast("あさみ", "12:00", null)] }));
  const slots = post(full, "shukyaku", /空き枠/);
  assert.match(slots.text, /【満員御礼】/);
  assert.ok(slots.warning);
  // 空き枠がなければ直前枠は口コミに切り替える
  assert.match(post(full, "shukyaku", /直前/).text, /【お客様の声】あさみさん ★5\n「とても丁寧で癒されました。また指名します！」/);
});

test("次に案内できる時刻は予約と準備時間を避けて出す", () => {
  const shift = { start: "12:00", end: "23:00" };
  // 12:00〜90分の予約＋準備20分 → 13:50から
  assert.equal(nextAvailableFor(shift, [{ start_time: "12:00", duration: 90 }], 20, null), "13:50");
  // 今が15:03なら15:10から
  assert.equal(nextAvailableFor(shift, [], 20, 15 * 60 + 3), "15:10");
  // 終わり1時間を切ったら案内できない
  assert.equal(nextAvailableFor(shift, [], 20, 22 * 60 + 10), null);
  // 日をまたぐ出勤（20:00〜翌3:00）で、今が0:30
  assert.equal(nextAvailableFor({ start: "20:00", end: "03:00" }, [], 20, 30), "00:30");
});

test("紹介するセラピストは同じ日なら毎回同じ人", () => {
  const a = post(buildDailyPosts(DEFAULT_X_OPERATIONS_PLAN.accounts, baseContext()), "shukyaku", /紹介/).pickup!.id;
  const b = post(buildDailyPosts(DEFAULT_X_OPERATIONS_PLAN.accounts, baseContext()), "shukyaku", /紹介/).pickup!.id;
  assert.equal(a, b);
});
