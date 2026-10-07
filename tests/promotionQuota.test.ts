import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_QUOTA_CONFIG,
  buildQuotaBoard,
  countShiftDays,
  expectedByNow,
  mentionsCast,
  newcomerInfo,
  normalizeQuotaConfig,
  planTaskChannel,
  requiredFor,
  summarizeQuota,
  tierIndexFor,
  tierLabel,
  xPostCountsAsPromotion,
  type QuotaBoardInput,
} from "../src/lib/promotionQuota.ts";

const config = DEFAULT_QUOTA_CONFIG;

test("出勤日数で段階が決まる（出勤なしはノルマなし）", () => {
  assert.equal(tierIndexFor(config, 0), null);
  assert.equal(tierIndexFor(config, 1), 0);
  assert.equal(tierIndexFor(config, 4), 0);
  assert.equal(tierIndexFor(config, 5), 1);
  assert.equal(tierIndexFor(config, 14), 2);
  assert.equal(tierIndexFor(config, 22), 3);
  assert.deepEqual(config.tiers.map((_, index) => tierLabel(config, index)), ["1〜4日", "5〜9日", "10〜14日", "15日以上"]);
});

test("必要回数：段階の回数＋新人月の上乗せ。HPトップバナーは新人だけ", () => {
  const regular = requiredFor(config, 10, false);
  assert.equal(regular.hp_top_banner, 0);
  assert.equal(regular.x_post, 6);
  assert.equal(regular.estama_top_banner, 1);
  const newcomer = requiredFor(config, 10, true);
  assert.equal(newcomer.hp_top_banner, 1);
  assert.equal(newcomer.x_post, 8);
  assert.equal(newcomer.hp_news, 2);
  // 出勤がない月は新人でも0
  assert.equal(Object.values(requiredFor(config, 0, true)).reduce((a, b) => a + b, 0), 0);
});

test("新人の上乗せは、入店から30日がいちばん長く入っている月に1回だけ", () => {
  assert.deepEqual(newcomerInfo("2026-09-05", 30), { joinDate: "2026-09-05", until: "2026-10-04", bonusMonth: "2026-09" });
  assert.equal(newcomerInfo("2026-09-20", 30)?.bonusMonth, "2026-10"); // 9月11日・10月19日
  assert.equal(newcomerInfo("2026-09-30", 30)?.bonusMonth, "2026-10");
  assert.equal(newcomerInfo("2026-09-16", 30)?.bonusMonth, "2026-09"); // 15日ずつ → 先の月
  assert.equal(newcomerInfo(null, 30), null);
});

test("出勤日数：取り消し・却下を除き、同じ日は1日", () => {
  const shifts = [
    { cast_id: "a", shift_date: "2026-10-01", status: "scheduled", approval_status: "approved" },
    { cast_id: "a", shift_date: "2026-10-01", status: "scheduled", approval_status: "approved" },
    { cast_id: "a", shift_date: "2026-10-02", status: "scheduled", approval_status: "pending" },
    { cast_id: "a", shift_date: "2026-10-03", status: "cancelled", approval_status: "approved" },
    { cast_id: "a", shift_date: "2026-10-04", status: "scheduled", approval_status: "rejected" },
    { cast_id: "a", shift_date: "2026-11-01", status: "scheduled", approval_status: "approved" },
    { cast_id: "b", shift_date: "2026-10-05", status: "scheduled", approval_status: "approved" },
  ];
  assert.equal(countShiftDays(shifts, "a", "2026-10"), 2);
});

test("今日までに終わっているべき回数（日割り）", () => {
  assert.equal(expectedByNow(6, "2026-10", "2026-09-30"), 0);
  assert.equal(expectedByNow(6, "2026-10", "2026-10-01"), 0);
  assert.equal(expectedByNow(6, "2026-10", "2026-10-16"), 3);
  assert.equal(expectedByNow(6, "2026-10", "2026-10-31"), 6);
  assert.equal(expectedByNow(6, "2026-10", "2026-11-03"), 6);
});

test("名前の見つけ方：絵文字・空白を無視、2文字の名前は他の言葉の一部を拾わない、ペアは両方", () => {
  assert.ok(mentionsCast("本日のおすすめ 伊藤 れなさん", "伊藤れな🔰"));
  assert.ok(mentionsCast("【NEW FACE】長谷川れい🔰さん入店", "長谷川れい"));
  assert.ok(!mentionsCast("れいなさん出勤", "長谷川れい"));
  assert.ok(mentionsCast("本日 りのさん 出勤です", "りの"));
  assert.ok(mentionsCast("りのちゃんの紹介", "りの"));
  assert.ok(!mentionsCast("ありのままの施術", "りの"));
  assert.ok(mentionsCast("りりか＆ももかの2輪車", "りりか&ももか"));
  assert.ok(mentionsCast("りりかさんとももかさんのペア", "りりか&ももか"));
  assert.ok(!mentionsCast("りりかさん出勤", "りりか&ももか"));
  assert.ok(!mentionsCast(null, "りの"));
});

test("Xは集客アカウントで投稿したもの（出勤・空き枠のまとめは除く）", () => {
  const base = { post_date: "2026-10-03", account_key: "shukyaku", text: "葵みずきさん", posted_text: null, posted_at: "2026-10-03T10:00:00Z" };
  assert.ok(xPostCountsAsPromotion({ ...base, slot_key: "12:00|セラピスト紹介" }));
  assert.ok(!xPostCountsAsPromotion({ ...base, slot_key: "10:00|本日の出勤" }));
  assert.ok(!xPostCountsAsPromotion({ ...base, slot_key: "15:00|空き枠速報" }));
  assert.ok(!xPostCountsAsPromotion({ ...base, slot_key: "12:00|セラピスト紹介", posted_at: null }));
  assert.ok(xPostCountsAsPromotion({ ...base, slot_key: "12:00|セラピスト紹介", posted_at: null, publish_status: "posted" }));
  assert.ok(!xPostCountsAsPromotion({ ...base, account_key: "kyujin", slot_key: "12:00|働く環境" }));
});

test("企画の投稿の媒体：宣伝先が空なら見出し（店舗X：・本人02：）から読む", () => {
  assert.equal(planTaskChannel({ channel_key: "o2_story", label: "ストーリー" }), "o2_post");
  assert.equal(planTaskChannel({ channel_key: "line_official", label: "LINE" }), null);
  assert.equal(planTaskChannel({ channel_key: null, label: "店舗X：桐生まいピックアップ投稿" }), "x_post");
  assert.equal(planTaskChannel({ channel_key: null, label: "本人X：出勤告知画像" }), "x_post");
  assert.equal(planTaskChannel({ channel_key: null, label: "本人02：初出勤告知投稿" }), "o2_post");
  assert.equal(planTaskChannel({ channel_key: null, label: "店舗HP：ニュース更新で入店告知" }), "hp_news");
  assert.equal(planTaskChannel({ channel_key: null, label: "エステ魂：ニュース投稿" }), "estama_news");
  assert.equal(planTaskChannel({ channel_key: null, label: "LINE公式：一斉配信" }), null);
});

test("保存された決まりを読む：壊れていれば既定、数は0〜60、HPトップバナーは段階に入れない", () => {
  assert.equal(normalizeQuotaConfig(null), DEFAULT_QUOTA_CONFIG);
  assert.equal(normalizeQuotaConfig({ tiers: [] }), DEFAULT_QUOTA_CONFIG);
  const read = normalizeQuotaConfig({
    tiers: [
      { minDays: 8, targets: { x_post: "5", hp_top_banner: 3 } },
      { minDays: 1, targets: { x_post: 999, o2_post: -2 } },
      { minDays: 1, targets: { x_post: 1 } },
    ],
    newcomerDays: 0,
    newcomerBonus: { hp_top_banner: 2 },
  });
  assert.deepEqual(read.tiers.map((tier) => tier.minDays), [1, 8]);
  assert.equal(read.tiers[0].targets.x_post, 60);
  assert.equal(read.tiers[0].targets.o2_post, 0);
  assert.equal(read.tiers[1].targets.x_post, 5);
  assert.equal(read.tiers[1].targets.hp_top_banner, 0);
  assert.equal(read.newcomerDays, 30);
  assert.equal(read.newcomerBonus.hp_top_banner, 2);
});

test("一覧：記録・企画・HPニュース・Xを媒体ごとに数え、遅れを出す", () => {
  const input: QuotaBoardInput = {
    month: "2026-10",
    today: "2026-10-16",
    config,
    casts: [
      { id: "mizuki", name: "葵みずき", join_date: "2026-09-05" },
      { id: "rena", name: "伊藤れな🔰", join_date: "2026-09-30" },
      { id: "rino", name: "りの", join_date: "2026-05-12" },
    ],
    shifts: [
      ...Array.from({ length: 5 }, (_, i) => ({ cast_id: "mizuki", shift_date: `2026-10-${String(i + 1).padStart(2, "0")}`, status: "scheduled", approval_status: "approved" })),
      ...Array.from({ length: 16 }, (_, i) => ({ cast_id: "rena", shift_date: `2026-10-${String(i + 1).padStart(2, "0")}`, status: "scheduled", approval_status: "approved" })),
    ],
    exposures: [
      { id: "e1", cast_id: "mizuki", channel_key: "o2_post", exposed_on: "2026-10-02", note: "O2の紹介", url: null, plan_id: null },
      { id: "e2", cast_id: "mizuki", channel_key: "o2_post", exposed_on: "2026-09-30", note: null, url: null, plan_id: null },
      { id: "e3", cast_id: "rena", channel_key: "hp_top_banner", exposed_on: "2026-10-01", note: null, url: null, plan_id: "p1" },
    ],
    plans: [{ id: "p1", title: "伊藤れな 入店告知", cast_ids: ["rena"] }],
    planTasks: [
      { id: "t1", plan_id: "p1", task_type: "posting", channel_key: "x_post", scheduled_on: "2026-10-02", is_completed: true, label: "入店告知" },
      { id: "t2", plan_id: "p1", task_type: "posting", channel_key: "o2_story", scheduled_on: "2026-10-03", is_completed: true, label: "ストーリー" },
      { id: "t3", plan_id: "p1", task_type: "posting", channel_key: "x_post", scheduled_on: "2026-10-20", is_completed: false, label: "2回目" },
      { id: "t4", plan_id: "p1", task_type: "posting", channel_key: "line_official", scheduled_on: "2026-10-04", is_completed: true, label: "LINE" },
      { id: "t5", plan_id: "p1", task_type: "preparation", channel_key: null, scheduled_on: null, is_completed: true, label: "撮影" },
    ],
    articles: [
      { id: "a1", title: "新人 伊藤れな 入店", content: "", created_at: "2026-09-30T16:00:00Z", is_published: true }, // 日本時間 10/1
      { id: "a2", title: "下書き 葵みずき", content: "", created_at: "2026-10-05T01:00:00Z", is_published: false },
    ],
    xPosts: [
      { post_date: "2026-10-05", account_key: "shukyaku", slot_key: "12:00|セラピスト紹介", text: "葵みずきさんのご紹介", posted_text: null, posted_at: "2026-10-05T03:00:00Z" },
      { post_date: "2026-10-05", account_key: "shukyaku", slot_key: "10:00|本日の出勤", text: "葵みずき 伊藤れな", posted_text: null, posted_at: "2026-10-05T01:00:00Z" },
    ],
  };
  const rows = buildQuotaBoard(input);
  assert.deepEqual(rows.map((row) => row.castId), ["rena", "mizuki", "rino"]);

  const rena = rows[0];
  assert.equal(rena.shiftDays, 16);
  assert.equal(rena.tierLabel, "15日以上");
  assert.equal(rena.newcomer?.bonusThisMonth, true);
  assert.equal(rena.cells.hp_top_banner.required, 1);
  assert.equal(rena.cells.hp_top_banner.done, 1);
  assert.equal(rena.cells.x_post.required, 10);
  assert.equal(rena.cells.x_post.done, 1);
  assert.equal(rena.cells.x_post.planned, 1);
  assert.equal(rena.cells.o2_post.done, 1); // O2ストーリーはO2に数える
  assert.equal(rena.cells.hp_news.done, 1); // 日本時間で10/1の記事
  assert.equal(rena.status, "behind");
  assert.ok(rena.behind.includes("x_post"));

  const mizuki = rows[1];
  assert.equal(mizuki.tierLabel, "5〜9日");
  assert.equal(mizuki.newcomer?.bonusThisMonth, false); // 上乗せは9月
  assert.equal(mizuki.cells.hp_top_banner.required, 0);
  assert.equal(mizuki.cells.o2_post.done, 1); // 9/30の記録は数えない
  assert.equal(mizuki.cells.x_post.done, 1); // 紹介だけ（出勤のまとめは除く）
  assert.equal(mizuki.cells.hp_news.done, 0); // 非公開の記事は数えない

  const rino = rows[2];
  assert.equal(rino.required, 0);
  assert.equal(rino.status, "none");
  assert.equal(rino.rate, null);

  const summary = summarizeQuota(rows);
  assert.equal(summary.therapists, 2);
  assert.equal(summary.completed, 0);
  assert.equal(summary.behind, 2);
  assert.equal(summary.required, rena.required + mizuki.required);
});
