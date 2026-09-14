import assert from "node:assert/strict";
import test from "node:test";
import {
  ESTAMA_PROVISIONAL_CALLER_NUMBER,
  isEstamaProvisionalReservation,
  normalizeCallerNumber,
} from "../src/lib/inquiryClassification.ts";

test("エステ魂の仮予約通知番号を国内表記へ正規化する", () => {
  assert.equal(normalizeCallerNumber("0120-286-634"), ESTAMA_PROVISIONAL_CALLER_NUMBER);
  assert.equal(normalizeCallerNumber("+81 120 286 634"), ESTAMA_PROVISIONAL_CALLER_NUMBER);
});

test("IVRYメールのエステ魂通知だけを仮予約に分類する", () => {
  assert.equal(isEstamaProvisionalReservation({
    channel: "phone",
    source: "ivry_email",
    caller_number: "0120-286-634",
  }), true);
});

test("手動電話入力と別番号のIVRY着信は電話に残す", () => {
  assert.equal(isEstamaProvisionalReservation({
    channel: "phone",
    source: "manual",
    caller_number: "0120-286-634",
  }), false);
  assert.equal(isEstamaProvisionalReservation({
    channel: "phone",
    source: "ivry_email",
    caller_number: "090-1234-5678",
  }), false);
});
