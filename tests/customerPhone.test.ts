import test from "node:test";
import assert from "node:assert/strict";
import { checkCustomerPhone, normalizeCustomerPhone } from "../src/lib/customerPhone.ts";

test("ハイフン・全角・空白・+81 を数字だけにそろえる", () => {
  assert.equal(normalizeCustomerPhone("090-1234-5678"), "09012345678");
  assert.equal(normalizeCustomerPhone("０８０－１２３４－５６７８"), "08012345678");
  assert.equal(normalizeCustomerPhone(" 070 1234 5678 "), "07012345678");
  assert.equal(normalizeCustomerPhone("+81 90-1234-5678"), "09012345678");
  assert.equal(normalizeCustomerPhone("+81-090-1234-5678"), "09012345678");
});

test("携帯電話の11桁だけ通す", () => {
  assert.deepEqual(checkCustomerPhone("090-1234-5678"), { ok: true, phone: "09012345678" });
  assert.deepEqual(checkCustomerPhone("08012345678"), { ok: true, phone: "08012345678" });
});

test("桁が足りない携帯の番号は桁数を出して止める", () => {
  const result = checkCustomerPhone("0801234567");
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.message : "", /11桁.*10桁/);
});

test("固定電話・050・空は止める", () => {
  assert.equal(checkCustomerPhone("022-123-4567").ok, false);
  assert.equal(checkCustomerPhone("050-1234-5678").ok, false);
  assert.equal(checkCustomerPhone("").ok, false);
  assert.equal(checkCustomerPhone("090-1234-56789").ok, false);
});
