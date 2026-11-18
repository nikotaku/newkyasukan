import assert from "node:assert/strict";
import test from "node:test";
import { pairShare, pairShareFirst, pairTotalFirst, splitPairNames } from "../src/lib/pairReceipt.ts";

test("Wセラピストの名前を2人に分ける", () => {
  assert.deepEqual(splitPairNames("りりか&ももか"), ["りりか", "ももか"]);
  assert.deepEqual(splitPairNames("りりか ＆ ももか"), ["りりか", "ももか"]);
  assert.equal(splitPairNames("りりか"), null);
  assert.equal(splitPairNames("a&b&c"), null);
});

test("金額は半分ずつ・足すと元に戻る", () => {
  assert.equal(pairShare(190000, 0), 95000);
  assert.equal(pairShare(190000, 1), 95000);
  assert.equal(pairShare(1001, 0) + pairShare(1001, 1), 1001);
});

test("表示の形", () => {
  assert.equal(pairTotalFirst(60000, 0), "¥60,000 (¥30,000)");
  assert.equal(pairShareFirst(142000, 1), "¥71,000 (¥142,000)");
  assert.equal(pairShareFirst(4000, 0, "- "), "- ¥2,000 (- ¥4,000)");
});
