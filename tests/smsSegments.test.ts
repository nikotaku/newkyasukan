import assert from "node:assert/strict";
import test from "node:test";

import { countSmsSegments, describeSmsCost, fillSmsTemplateSample } from "../src/lib/smsSegments.ts";

test("日本語は70文字までが1通分、超えると67文字ごと", () => {
  assert.deepEqual(countSmsSegments("あ".repeat(70)), { encoding: "UCS-2", length: 70, segments: 1 });
  assert.equal(countSmsSegments("あ".repeat(71)).segments, 2);
  assert.equal(countSmsSegments("あ".repeat(134)).segments, 2);
  assert.equal(countSmsSegments("あ".repeat(135)).segments, 3);
});

test("英数字だけなら160文字までが1通分、超えると153文字ごと", () => {
  assert.deepEqual(countSmsSegments("a".repeat(160)), { encoding: "GSM-7", length: 160, segments: 1 });
  assert.equal(countSmsSegments("a".repeat(161)).segments, 2);
  assert.equal(countSmsSegments("").segments, 0);
  // 拡張文字は2文字分
  assert.equal(countSmsSegments("{}").length, 4);
});

test("テンプレートの変数を例の値で埋め、値が空の行は消す", () => {
  const filled = fillSmsTemplateSample("{name}様\n担当:{cast}\n目印:{room_landmark}", { name: "山田", cast: "", room_landmark: "1階" });
  assert.equal(filled, "山田様\n目印:1階");
});

test("通数と概算料金", () => {
  assert.deepEqual(describeSmsCost("あ".repeat(100)), { length: 100, segments: 2, yen: 29 });
});
