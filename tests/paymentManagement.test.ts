import test from "node:test";
import assert from "node:assert/strict";
import {
  accountNumberTail,
  fixedCostPaymentState,
  scheduledPaymentDate,
} from "../src/lib/paymentManagement.ts";

test("月末より後の支払日はその月の最終日になる", () => {
  assert.equal(scheduledPaymentDate(2026, 1, 31)?.toISOString().slice(0, 10), "2026-02-28");
});

test("支払済み・未払い記録・期限超過・予定を判定する", () => {
  const selectedMonth = new Date(2026, 9, 1);
  const today = new Date(2026, 9, 10);
  assert.equal(fixedCostPaymentState({ paymentDay: 5, paid: true, recorded: true, selectedMonth, today }), "paid");
  assert.equal(fixedCostPaymentState({ paymentDay: 5, paid: false, recorded: true, selectedMonth, today }), "unpaid");
  assert.equal(fixedCostPaymentState({ paymentDay: 5, paid: false, recorded: false, selectedMonth, today }), "overdue");
  assert.equal(fixedCostPaymentState({ paymentDay: 20, paid: false, recorded: false, selectedMonth, today }), "upcoming");
});

test("口座番号は末尾4桁だけ表示できる", () => {
  assert.equal(accountNumberTail("1234567"), "＊＊＊4567");
  assert.equal(accountNumberTail("1234"), "1234");
  assert.equal(accountNumberTail(null), "");
});
