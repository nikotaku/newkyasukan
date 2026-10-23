import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkedIds,
  moveInList,
  moveModule,
  orderedCategories,
  parseCategoryList,
  renumberByCategories,
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

test("カテゴリの並び：保存した順のあとに講習だけにあるカテゴリ", () => {
  const modules = [
    { id: "a", category: "接客", display_order: 10 },
    { id: "b", category: "施術", display_order: 20 },
    { id: "c", category: "一般", display_order: 30 },
  ];
  assert.deepEqual(orderedCategories(["施術", "衛生"], modules), ["施術", "衛生", "接客", "一般"]);
  assert.deepEqual(parseCategoryList('["a"," a ","",3,"b"]'), ["a", "b"]);
  assert.deepEqual(parseCategoryList("壊れた"), []);
  assert.deepEqual(moveInList(["x", "y", "z"], 0, 2), ["y", "z", "x"]);
});

test("講習のドラッグ移動：別のカテゴリの途中へ・最後へ", () => {
  const modules = [
    { id: "a", category: "接客", display_order: 10 },
    { id: "b", category: "接客", display_order: 20 },
    { id: "c", category: "施術", display_order: 30 },
  ];
  const cats = ["接客", "施術", "衛生"];
  const r1 = moveModule(modules, cats, "a", "施術", "c");
  assert.deepEqual(r1.modules.map((m) => `${m.id}:${m.category}:${m.display_order}`), ["b:接客:10", "a:施術:20", "c:施術:30"]);
  assert.deepEqual(r1.changed.map((c) => c.id).sort(), ["a", "b"]);

  const r2 = moveModule(modules, cats, "b", "衛生", null);
  assert.deepEqual(r2.modules.map((m) => `${m.id}:${m.category}`), ["a:接客", "c:施術", "b:衛生"]);

  const r3 = moveModule(modules, cats, "b", "接客", "a");
  assert.deepEqual(r3.modules.map((m) => m.id), ["b", "a", "c"]);
  assert.equal(moveModule(modules, cats, "a", "接客", "a").changed.length, 0);
});

test("カテゴリの並べ替えで講習の順番も振り直す", () => {
  const modules = [
    { id: "a", category: "接客", display_order: 10 },
    { id: "c", category: "施術", display_order: 30 },
  ];
  const r = renumberByCategories(modules, ["施術", "接客"]);
  assert.deepEqual(r.modules.map((m) => `${m.id}:${m.display_order}`), ["c:10", "a:20"]);
  assert.equal(r.changed.length, 2);
});
