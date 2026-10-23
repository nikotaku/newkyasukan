import { test } from "node:test";
import assert from "node:assert/strict";
import { signatureCombo, systemItem } from "../src/lib/interviewSystem.ts";

test("店落ちは料金からバックを引いた額", () => {
  assert.equal(systemItem("a", "艶華 80分", 19000, 10000).shop, 9000);
  assert.equal(systemItem("n", "ネット指名", 1000, null).shop, 1000);
});

test("鉄板の組み合わせは足し算", () => {
  const combo = signatureCombo(systemItem("c", "艶華 80分", 19000, 10000), systemItem("o", "オプションパック -牡丹-", 10000, 10000));
  assert.deepEqual(combo && { price: combo.price, back: combo.back, shop: combo.shop }, { price: 29000, back: 20000, shop: 9000 });
  assert.equal(signatureCombo(undefined, systemItem("o", "x", 1, 1)), null);
});
