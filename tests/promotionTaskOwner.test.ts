import assert from "node:assert/strict";
import test from "node:test";
import { promotionTaskOwner } from "../src/lib/promotionTaskOwner.ts";
import { buildStandardPromotionSchedule } from "../src/lib/standardPromotionSchedule.ts";
import {
  groupPromotionPostings,
  promotionPostingProgress,
  therapistOnlyPromotionPlans,
  type TherapistPromotionPlan,
  type TherapistPromotionTask,
} from "../src/lib/therapistPromotion.ts";

const task = (id: string, label: string, channelKey: string | null, taskType = "posting"): TherapistPromotionTask => ({
  id, label, channelKey, taskType, scheduledOn: "2026-11-03", groupLabel: "告知",
  isCompleted: false, completedAt: null, storeCompleted: true, sortOrder: 10,
});
const plan = (tasks: TherapistPromotionTask[]): TherapistPromotionPlan => ({
  id: "plan", title: "合同宣伝", therapistLabel: "りりか＆ももか", description: "店舗専用：バナー設置とLINE配信",
  startsOn: "2026-11-03", endsOn: "2026-11-06", tasks,
  channels: [
    { key: "hp_top_banner", label: "HPトップバナー", count: 1, sizeSpec: "1200×628", sortOrder: 10 },
    { key: "x_post", label: "X", count: 8, sizeSpec: "1080×1080", sortOrder: 20 },
    { key: "o2_post", label: "O2投稿", count: 9, sizeSpec: null, sortOrder: 30 },
    { key: "o2_story", label: "O2ストーリー", count: 1, sizeSpec: null, sortOrder: 40 },
    { key: "line_official", label: "LINE公式", count: 1, sizeSpec: null, sortOrder: 50 },
  ],
});

test("準備物・バナー・ニュース・LINE公式は本人投稿と混ぜない", () => {
  for (const [label, key, type] of [
    ["動画3本", null, "preparation"], ["本人X：素材", "x_post", "preparation"],
    ["HPトップバナー", "hp_top_banner", "posting"], ["エステ魂バナー", "estama_top_banner", "posting"],
    ["HPニュース", "hp_news", "posting"], ["エステ魂ニュース", "estama_news", "posting"],
    ["本人X：LINE配信", "line_official", "posting"], ["告知バナーを設置", null, "posting"],
    ["HPニュース：本人Xの紹介", "x_post", "posting"], ["LINE公式：本人O2", "o2_post", "posting"],
    ["ＬＩＮＥ公式：告知", null, "posting"], ["line公式：告知", "x_post", "posting"],
  ]) assert.equal(promotionTaskOwner(type, label, key), "store", `${label}/${key}`);
});

test("本人のX・O2・ストーリーを表示し、店舗表記は媒体より優先する", () => {
  for (const key of ["x_post", "o2_post", "o2_story"]) {
    assert.equal(promotionTaskOwner("posting", "本人の投稿", key), "therapist");
    for (const prefix of ["店舗", "お店", "公式アカウント"]) {
      assert.equal(promotionTaskOwner("posting", `${prefix}X：告知`, key), "store");
    }
  }
  for (const prefix of ["X", "Ｘ投稿", "本人X", "本人のX", "セラピストX投稿", "個人のX", "02投稿", "O2投稿", "Ｏ2ストーリー", "０2投稿", "本人O2"]) {
    assert.equal(promotionTaskOwner("posting", ` ${prefix}：告知`, null), "therapist", prefix);
  }
  assert.equal(promotionTaskOwner("posting", "店舗02ストーリー：告知", null), "store");
});

test("担当の判定は見出しだけで行い、本文の店舗・バナー素材や名前で誤判定しない", () => {
  assert.equal(promotionTaskOwner("posting", "本人X：お店から受け取った告知バナーを使う", "x_post"), "therapist");
  assert.equal(promotionTaskOwner("posting", "02投稿（本人媒体）：店舗の写真とニュース①を使う", "o2_post"), "therapist");
  assert.equal(promotionTaskOwner("posting", "告知バナー：X O2りなさん", null), "store");
  assert.equal(promotionTaskOwner("posting", "未知の作業：本人X", null), "store");
  assert.equal(promotionTaskOwner(null, "本人X", "x_post"), "store");
  assert.equal(promotionTaskOwner("posting", null, null), "store");
});

test("ポータルのタスク・媒体・件数・説明から店舗作業を除外し元データを変えない", () => {
  const raw = [plan([
    task("banner", "HPトップバナー", "hp_top_banner"), task("prep", "動画準備", null, "preparation"),
    task("store-x", "店舗X：告知", "x_post"), task("x1", "X：告知", "x_post"),
    { ...task("x2", "本人X：告知", "x_post"), isCompleted: true },
    task("store-o2", "店舗O2：告知", "o2_post"), task("o2", "02投稿：告知", "o2_post"),
    task("story", "02ストーリー：告知", "o2_story"), task("line", "LINE公式：告知", "line_official"),
  ])];
  const original = structuredClone(raw);
  const visible = therapistOnlyPromotionPlans(raw);
  assert.deepEqual(visible[0].tasks.map((t) => t.id), ["x1", "x2", "o2", "story"]);
  assert.deepEqual(visible[0].channels.map((c) => [c.key, c.count]), [["x_post", 2], ["o2_post", 1], ["o2_story", 1]]);
  assert.equal(visible[0].channels[0].sizeSpec, "1080×1080");
  assert.equal(visible[0].description, null);
  assert.deepEqual(promotionPostingProgress(raw), { total: 4, completed: 1 });
  assert.deepEqual(groupPromotionPostings(raw[0].tasks).flatMap((g) => g.tasks.map((t) => t.id)), ["x1", "x2", "o2", "story"]);
  assert.deepEqual(raw, original);
  assert.deepEqual(therapistOnlyPromotionPlans(visible), visible);
});

test("本人投稿のない店舗専用計画をポータルの予定と進捗に表示しない", () => {
  const raw = [plan([task("banner", "HPトップバナー", "hp_top_banner"), task("prep", "写真準備", null, "preparation")])];
  assert.deepEqual(therapistOnlyPromotionPlans(raw), []);
  assert.deepEqual(promotionPostingProgress(raw), { total: 0, completed: 0 });
});

test("古い媒体未設定の本人投稿もX・O2・ストーリーの正しい件数で表示する", () => {
  const visible = therapistOnlyPromotionPlans([plan([
    task("x", "本人X：告知", null), task("o2", "02投稿：告知", null), task("story", "02ストーリー：告知", null),
    task("shop", "店舗X：告知", null),
  ])]);
  assert.deepEqual(visible[0].channels.map((c) => [c.key, c.count]), [["x_post", 1], ["o2_post", 1], ["o2_story", 1]]);
});

test("標準作成の全媒体も、本人投稿3媒体と店舗準備・掲載作業に分かれる", () => {
  const keys = ["hp_top_banner", "estama_top_banner", "x_post", "o2_post", "o2_story", "line_official"] as const;
  const schedule = buildStandardPromotionSchedule({
    therapistNames: ["ももか", "りりか"], startsOn: "2026-11-03", endsOn: "2026-11-08",
    channels: keys.map((key) => ({ key, label: key, count: 1, sizeSpec: "1080×1080" })),
  });
  const postings = schedule.posting.flatMap((g) => g.items);
  assert.deepEqual(postings.map((t) => promotionTaskOwner("posting", t.label, t.channel_key)), ["store", "store", "therapist", "therapist", "therapist", "store"]);
  assert.ok(schedule.preparation.every((t) => promotionTaskOwner("preparation", t.label, null) === "store"));
});
