import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultAccommodationFee,
  defaultMiscExpenses,
  isDekasegiTherapist,
  miscExpensesHint,
} from "../src/lib/clearanceDefaults.ts";

test("雑費は1本1,000円、1日2,000円まで", () => {
  assert.equal(defaultMiscExpenses(0), 0);
  assert.equal(defaultMiscExpenses(1), 1_000);
  assert.equal(defaultMiscExpenses(2), 2_000);
  assert.equal(defaultMiscExpenses(3), 2_000);
  assert.equal(defaultMiscExpenses(-1), 0);
  assert.equal(defaultMiscExpenses(Number.NaN), 0);
});

test("出稼ぎのセラピストだけ宿泊費1日2,000円", () => {
  assert.equal(defaultAccommodationFee(["出稼ぎ"]), 2_000);
  assert.equal(defaultAccommodationFee(["在籍", " 出稼ぎ "]), 2_000);
  assert.equal(defaultAccommodationFee(["在籍"]), 0);
  assert.equal(defaultAccommodationFee(null), 0);
  assert.equal(isDekasegiTherapist(["出稼ぎ希望"]), false);
});

test("自動入力の説明", () => {
  assert.equal(miscExpensesHint(1), "自動：1本×¥1,000＝¥1,000");
  assert.equal(miscExpensesHint(3), "自動：3本×¥1,000（1日¥2,000まで）＝¥2,000");
});
