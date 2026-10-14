import assert from "node:assert/strict";
import test from "node:test";

import { buildDraftRequest, promotionTaskKind } from "../src/lib/promotionTaskDraft.ts";

test("タスクの種類（ラベルの頭と宣伝先から。DBの promotion_task_kind と同じ）", () => {
  assert.equal(promotionTaskKind("02ストーリー：本日の空き枠を案内", "o2_story"), "o2_story");
  assert.equal(promotionTaskKind("本人02：近況と空き枠", "o2_post"), "self_o2");
  assert.equal(promotionTaskKind("02投稿：初日の出勤時間を案内", "o2_post"), "self_o2");
  assert.equal(promotionTaskKind("店舗02：新人紹介", "o2_post"), "store_o2");
  assert.equal(promotionTaskKind("本人X：コメント＋写真", null), "self_x");
  assert.equal(promotionTaskKind("店舗X：在籍継続のお知らせ", null), "store_x");
  assert.equal(promotionTaskKind("X：ショート動画で告知", "x_post"), "store_x");
  assert.equal(promotionTaskKind("こよみ&れいな X：2人の紹介", "x_post"), "store_x");
  assert.equal(promotionTaskKind("店舗エスたま：新人紹介ページを公開", "estama_top_banner"), "manual");
  assert.equal(promotionTaskKind("LINE公式：第1回配信", "line_official"), "manual");
  assert.equal(promotionTaskKind("エステ魂・HP告知用ニュース文", null), "estama_news");
  assert.equal(promotionTaskKind("HPニュースで出勤を告知", null), "hp_news");
});

test("AIに渡す材料：出勤・休憩・予約URL", () => {
  const request = buildDraftRequest(
    { label: "本人02：月末の空き枠情報", channel_key: "o2_post" },
    {
      storeName: "テスト店",
      therapists: [{ name: "さくら", profile: "笑顔が素敵", bookingUrl: "https://example.com/r/abcd1234" }],
      date: "2026-10-20",
      shifts: [{ name: "さくら", start: "13:00", end: "22:00", breakText: "休憩 18:00〜19:00" }],
    },
  );
  assert.equal(request.type, "x_post");
  assert.equal(request.xAccount.name, "セラピスト本人のO2");
  assert.match(request.xFacts, /さくら 13:00〜22:00（休憩 18:00〜19:00）/);
  assert.match(request.xFacts, /予約URL：https:\/\/example.com\/r\/abcd1234/);
  const noShift = buildDraftRequest({ label: "店舗X：紹介", channel_key: null }, { storeName: "テスト店", therapists: [], date: "2026-10-20", shifts: [] });
  assert.match(noShift.xFacts, /出勤時間は書かない/);
});
