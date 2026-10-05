import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGuidePayments, parseGuideSteps, safePaymentLink } from "../src/lib/reservationGuidePayment.ts";

test("手順は1行に1つ、先頭の番号は外す", () => {
  assert.deepEqual(parseGuideSteps("1. ページを開く\n② 金額を入力\n\n・決済する\n  完了  "), ["ページを開く", "金額を入力", "決済する", "完了"]);
  assert.deepEqual(parseGuideSteps(null), []);
});

test("決済リンクは http(s) だけ", () => {
  assert.equal(safePaymentLink("https://pay.example.jp/shop.php?tel=&payc=A1"), "https://pay.example.jp/shop.php?tel=&payc=A1");
  assert.equal(safePaymentLink("javascript:alert(1)"), null);
  assert.equal(safePaymentLink(""), null);
  assert.equal(safePaymentLink(null), null);
});

test("カード・PayPayの分だけ、手数料込みの金額で出す", () => {
  const payments = normalizeGuidePayments([
    { method: "card", amount: 33000, fee: 3000, link: "https://pay.example.jp/", guide: "開く\n入力" },
    { method: "paypay", amount: 0, fee: 0, link: null, guide: null },
    { method: "cash", amount: 10000 },
    "壊れた値",
  ]);
  assert.deepEqual(payments, [
    { method: "card", amount: 33000, fee: 3000, link: "https://pay.example.jp/", steps: ["開く", "入力"] },
  ]);
  assert.deepEqual(normalizeGuidePayments(undefined), []);
});
