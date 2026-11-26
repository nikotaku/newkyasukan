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

test("マイページのバック表：えすたま限定プランは別の見出しで、中身を箇条書きに", async () => {
  const { estamaPlanContents } = await import("../src/lib/rateMaster.ts");
  assert.deepEqual(estamaPlanContents("60分＋10分延長＋マイクロビキニ。まずは気軽に艶華を体験。"), ["艶華コース 60分", "10分延長", "マイクロビキニ"]);
  assert.deepEqual(estamaPlanContents("全身をたっぷりと。"), []);
  const sections = therapistBackSections({
    courses: [
      { name: "艶華", minutes: 60, back: 8000, description: "はじめての方にも。" },
      { name: "エスたま限定", minutes: 110, back: 21000, description: "100分＋マイクロビキニ＋深層リンパ。じっくり癒される贅沢プラン。" },
    ],
    options: [],
    nominations: [],
  });
  assert.deepEqual(sections.map((s) => s.title), ["コース", "えすたま限定プラン"]);
  assert.equal(sections[0].rows.length, 1);
  assert.deepEqual(sections[1].rows[0].contents, ["艶華コース 100分", "マイクロビキニ", "深層リンパ"]);
  assert.equal(sections[1].rows[0].note, "施術は合計110分");
});

test("割引の変更は足す・直す・消すに分け、並び順も入れる", async () => {
  const { planDiscountSave } = await import("../src/lib/rateMaster.ts");
  const before = [
    { key: "a", id: "a", name: "新規割", type: "fixed" as const, value: 1000, active: true },
    { key: "b", id: "b", name: "古い割引", type: "fixed" as const, value: 500, active: true },
  ];
  const after = [
    { key: "a", id: "a", name: "新規割", type: "fixed" as const, value: 2000, active: true },
    { key: "n", id: null, name: "10%割", type: "percentage" as const, value: 10, active: true },
  ];
  const plan = planDiscountSave(before, after);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].payload.discount_value, 2000);
  assert.equal(plan.inserts[0].display_order, 2);
  assert.deepEqual(plan.deletes, ["b"]);
});

test("決済方法は変えたものだけ直す", async () => {
  const { planPaymentSave } = await import("../src/lib/rateMaster.ts");
  const rows = [{ id: "p", method: "PayPay", fee: 10, link: "https://x.example/", guide: "", active: true }];
  assert.equal(planPaymentSave(rows, rows).updates.length, 0);
  assert.equal(planPaymentSave(rows, [{ ...rows[0], fee: 8 }]).updates[0].payload.fee_percentage, 8);
});

test("変更の記録を読める文にする", async () => {
  const { describeRateChange, discountValueLabel } = await import("../src/lib/rateMaster.ts");
  assert.deepEqual(describeRateChange({
    id: 1, changed_at: "", changed_by_email: null, table_name: "back_rates", action: "update", item_label: "艶華 60分",
    changes: { customer_price: { before: 15000, after: 16000 }, is_visible: { before: true, after: false } },
  }), ["料金：¥15,000 → ¥16,000", "HP表示：オン → オフ"]);
  assert.deepEqual(describeRateChange({
    id: 2, changed_at: "", changed_by_email: null, table_name: "payment_settings", action: "update", item_label: "PayPay",
    changes: { fee_percentage: { before: 10, after: 11 } },
  }), ["手数料：10% → 11%"]);
  assert.equal(discountValueLabel({ type: "percentage", value: 10 }), "10%OFF");
  assert.equal(discountValueLabel({ type: "fixed", value: 1000 }), "¥1,000引き");
});
