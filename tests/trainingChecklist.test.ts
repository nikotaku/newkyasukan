import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkedIds,
  combinedProgress,
  moduleItems,
  moduleProgress,
  normalizeChecklist,
  statusFromProgress,
} from "../src/lib/trainingChecklist.ts";

const list = normalizeChecklist([
  { id: "a", label: "出勤ルール" },
  { id: "b", label: "身だしなみ" },
  { id: "c", label: "遅刻の連絡" },
  { id: "", label: "id なしは捨てる" },
]);

test("チェック項目を読み込む（壊れた行は捨てる）", () => {
  assert.equal(list.length, 3);
  assert.deepEqual(normalizeChecklist(null), []);
});

test("チェックした数で％を出す", () => {
  const p = moduleProgress(list, { status: "in_progress", checked_items: ["a", "c"] });
  assert.deepEqual(p, { done: 2, total: 3, pct: 67 });
  assert.equal(statusFromProgress(p), "in_progress");
  assert.equal(statusFromProgress(moduleProgress(list, { checked_items: ["a", "b", "c"] })), "completed");
  assert.equal(statusFromProgress(moduleProgress(list, { checked_items: [] })), "not_started");
});

test("消した項目のチェックは数えない", () => {
  assert.equal(checkedIds(list, { checked_items: ["a", "zzz"] }).size, 1);
});

test("チェックリスト前の「完了」は全部チェック済み", () => {
  assert.equal(moduleProgress(list, { status: "completed", checked_items: null }).pct, 100);
  assert.equal(moduleProgress(list, { status: "in_progress", checked_items: null }).pct, 0);
  assert.equal(moduleProgress(list, null).pct, 0);
});

test("項目が無い講習は「受講した」1つ", () => {
  assert.equal(moduleItems([]).length, 1);
  assert.equal(moduleProgress([], { checked_items: ["done"] }).pct, 100);
});

test("カテゴリの％は項目の数でまとめる", () => {
  const p = combinedProgress([
    moduleProgress(list, { checked_items: ["a", "b", "c"] }),
    moduleProgress([], { checked_items: [] }),
  ]);
  assert.deepEqual(p, { done: 3, total: 4, pct: 75 });
});
