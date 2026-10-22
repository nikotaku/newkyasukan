import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceSplit, initialSplit, splitError, splitFee } from "../src/lib/therapistSplitPayment.ts";

const settings = [
  { id: "1", payment_method: "クレジットカード", payment_link: null, fee_percentage: 10 },
  { id: "2", payment_method: "PayPay", payment_link: null, fee_percentage: 5 },
];

test("カードで払った後に足したオプションは現金に分ける", () => {
  assert.deepEqual(initialSplit("card", 18000, 21000), [
    { method: "card", amount: 18000 },
    { method: "cash", amount: 3000 },
  ]);
  assert.equal(initialSplit("cash", 18000, 21000)[1].method, "card");
});

test("料金が変わったら最後の行で合わせる", () => {
  const rows = balanceSplit([{ method: "card", amount: 18000 }, { method: "cash", amount: 3000 }], 23000);
  assert.equal(rows[1].amount, 5000);
  assert.equal(balanceSplit([{ method: "card", amount: 30000 }, { method: "cash", amount: 1 }], 20000)[1].amount, 0);
});

test("合計が合わない・0円・1つだけはだめ", () => {
  assert.equal(splitError([{ method: "card", amount: 18000 }, { method: "cash", amount: 3000 }], 21000), null);
  assert.match(splitError([{ method: "card", amount: 18000 }, { method: "cash", amount: 2000 }], 21000) ?? "", /合いません/);
  assert.match(splitError([{ method: "card", amount: 21000 }, { method: "cash", amount: 0 }], 21000) ?? "", /0円/);
  assert.ok(splitError([{ method: "card", amount: 21000 }], 21000));
});

test("手数料はカード・PayPayの分だけ", () => {
  assert.equal(splitFee([{ method: "card", amount: 18000 }, { method: "cash", amount: 3000 }], settings), 1800);
  assert.equal(splitFee([{ method: "paypay", amount: 1000 }, { method: "card", amount: 1000 }], settings), 150);
});
