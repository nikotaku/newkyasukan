import assert from "node:assert/strict";
import test from "node:test";

import { describeError } from "../server/estama-error.ts";

test("Supabaseのエラー（素のオブジェクト）は[object Object]ではなく中身を出す", () => {
  const error = { message: "permission denied for table casts", code: "42501", details: null, hint: "GRANT SELECT" };
  assert.equal(describeError(error), "permission denied for table casts（42501）");
});

test("Errorと文字列はそのまま", () => {
  assert.equal(describeError(new Error("エステ魂の保存ボタンが見つかりません")), "エステ魂の保存ボタンが見つかりません");
  assert.equal(describeError("タイムアウト"), "タイムアウト");
});

test("messageのないオブジェクトはJSONで出す", () => {
  assert.equal(describeError({ status: 500 }), '{"status":500}');
  assert.equal(describeError(null), "null");
});
