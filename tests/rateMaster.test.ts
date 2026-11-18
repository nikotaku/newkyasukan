import assert from "node:assert/strict";
import test from "node:test";
import { planRateSave, rowsFromRecords, shopBack, therapistBackSections, validateRateRows, type RateRow } from "../src/lib/rateMaster.ts";

const rows = rowsFromRecords(
  [{ id: "c1", course_type: "艶華", duration: 60, customer_price: 15000, therapist_back: 8000, is_visible: true, description: null },
   { id: "c2", course_type: "艶華", duration: 80, customer_price: 19000, therapist_back: 10000, is_visible: true, description: null }],
  [{ id: "o1", option_name: "延長20分", customer_price: 5000, therapist_back: 3000, extension_minutes: 20, is_visible: true }],
  [{ id: "n1", nomination_type: "ネット指名", customer_price: 1000, therapist_back: null }],
);

test("店落ちは料金−バック", () => {
  assert.equal(shopBack(rows[0]), 7000);
  assert.equal(shopBack(rows[3]), 1000);
});

test("変わった行だけ保存する", () => {
  const after: RateRow[] = rows.map((row) => (row.id === "c2" ? { ...row, back: 11000 } : row));
  const plans = planRateSave(rows, after);
  const course = plans.find((plan) => plan.kind === "course")!;
  assert.equal(course.updates.length, 1);
  assert.equal(course.updates[0].payload.therapist_back, 11000);
  assert.equal(course.updates[0].payload.shop_back, 8000);
  assert.equal(plans.reduce((n, p) => n + p.inserts.length + p.deletes.length, 0), 0);
});

test("並べ替え・追加・削除", () => {
  const added: RateRow = { key: "x", id: null, kind: "option", name: "極液", minutes: null, price: 2000, back: 2000, visible: true, description: "" };
  const after = [rows[1], rows[0], added, rows[3]];
  const plans = planRateSave(rows, after);
  const course = plans.find((plan) => plan.kind === "course")!;
  assert.deepEqual(course.updates.map((u) => [u.id, u.payload.display_order]), [["c2", 0], ["c1", 1]]);
  const option = plans.find((plan) => plan.kind === "option")!;
  assert.deepEqual(option.deletes, ["o1"]);
  assert.equal(option.inserts[0].option_name, "極液");
});

test("入力の確かめ", () => {
  assert.deepEqual(validateRateRows(rows), []);
  const bad = [...rows, { ...rows[0], key: "d", id: null }, { ...rows[1], key: "e", id: null, back: 30000 }];
  const errors = validateRateRows(bad);
  assert.ok(errors.some((e) => e.includes("2行")));
  assert.ok(errors.some((e) => e.includes("料金より多く")));
});

test("マイページのバック表", () => {
  const sections = therapistBackSections({
    courses: [{ name: "艶華", minutes: 60, back: 8000 }],
    options: [{ name: "延長20分", minutes: 20, back: 3000 }],
    nominations: [{ name: "ネット指名", back: null }, { name: "本指名", back: 2000 }],
  });
  assert.deepEqual(sections.map((s) => s.title), ["コース", "オプション", "指名"]);
  assert.equal(sections[0].rows[0].label, "艶華 60分");
  assert.equal(sections[2].rows[0].back, null);
});
