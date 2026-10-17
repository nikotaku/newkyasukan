import assert from "node:assert/strict";
import test from "node:test";

import {
  cashReturnLabel,
  cashReturnTotal,
  syncCashReturnItems,
  unreflectedCashReturns,
  type CashReturn,
} from "../src/lib/cashReturns.ts";
import {
  combineClearanceExtraItems,
  splitClearanceExtraItems,
  splitSalaryAdjustments,
  type ClearanceExtraItem,
} from "../src/lib/clearanceExtraItems.ts";

const ret = (id: string, amount: number, extra: Partial<CashReturn> = {}): CashReturn => ({
  id,
  reservation_id: `r-${id}`,
  kind: "cashback",
  amount,
  reason: "施術時間不足",
  note: null,
  source: "staff",
  created_at: "2026-10-17T12:00:00Z",
  ...extra,
});

test("行の名前：種類・お客様・理由、本人申告の印", () => {
  assert.equal(cashReturnLabel(ret("a", 2000), "テスト"), "キャッシュバック（テスト様・施術時間不足）");
  assert.equal(
    cashReturnLabel(ret("b", 1000, { kind: "refund", reason: "お釣りの返し忘れ", source: "therapist" })),
    "返金（お釣りの返し忘れ）［本人申告］",
  );
});

test("まだ締めていない精算に、記録された返金を足し、取り消されたものは外す", () => {
  const manual: ClearanceExtraItem = { label: "講習手当", amount: 3000, kind: "salary_addition" };
  const stale: ClearanceExtraItem = { label: "返金（古い）", amount: 500, kind: "cash_return", source_return_id: "gone" };
  const kept: ClearanceExtraItem = { label: "キャッシュバック（済）", amount: 1000, kind: "cash_return", source_return_id: "a" };

  const synced = syncCashReturnItems([manual, stale, kept], [ret("a", 1000), ret("b", 2000)], (id) => (id === "r-b" ? "テスト" : null));
  assert.deepEqual(synced.map((item) => item.source_return_id ?? item.label), ["講習手当", "a", "b"]);
  assert.equal(synced[2].label, "キャッシュバック（テスト様・施術時間不足）");
  assert.equal(synced[2].kind, "cash_return");
  assert.equal(cashReturnTotal([ret("a", 1000), ret("b", 2000)]), 3000);
});

test("締めた精算に入っていない返金を見つける", () => {
  const items: ClearanceExtraItem[] = [{ label: "x", amount: 1000, kind: "cash_return", source_return_id: "a" }];
  assert.deepEqual(unreflectedCashReturns(items, [ret("a", 1000), ret("b", 500)]).map((item) => item.id), ["b"]);
});

test("返金の行は給与の追加支給にも不足分の相殺にも入らず、保存しても種類が残る", () => {
  const items: ClearanceExtraItem[] = [
    { label: "講習手当", amount: 3000, kind: "salary_addition" },
    { label: "前回の不足分", amount: 2000, kind: "shortage_offset", source_clearance_id: "c1" },
    { label: "返金", amount: 1500, kind: "cash_return", source_return_id: "a" },
  ];
  const split = splitSalaryAdjustments(items);
  assert.equal(split.additionTotal, 3000);
  assert.equal(split.offsetTotal, 2000);
  assert.equal(split.returnTotal, 1500);

  const saved = combineClearanceExtraItems([], items);
  const restored = splitClearanceExtraItems(saved).salaryAdditions;
  assert.deepEqual(restored.map((item) => item.kind), ["salary_addition", "shortage_offset", "cash_return"]);
  assert.equal(restored[2].source_return_id, "a");
});
