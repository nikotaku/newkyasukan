import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBalanceAlertMessage,
  jstMonthStart,
  monthUsageFromRecords,
  shouldSendBalanceAlert,
  summarizeTwilioBilling,
} from "../supabase/functions/sms-billing/billing.ts";

const now = new Date("2026-09-28T03:00:00.000Z");

test("月初は日本時間で数える", () => {
  assert.equal(jstMonthStart(now).toISOString(), "2026-08-31T15:00:00.000Z");
  assert.equal(jstMonthStart(new Date("2026-09-30T16:00:00.000Z")).toISOString(), "2026-09-30T15:00:00.000Z");
});

test("今月の使用額は totalprice が無ければ主要カテゴリを足す（子カテゴリは二重に数えない）", () => {
  const records = [
    { category: "phonenumbers-local", price: "185.60839" },
    { category: "phonenumbers-setups", price: "0" },
    { category: "sms", price: "9.37727" },
    { category: "sms-inbound", price: "9.37727" },
    { category: "channels", price: "9.37727" },
  ];
  assert.equal(Math.round(monthUsageFromRecords(records) * 100) / 100, 194.99);
  assert.equal(monthUsageFromRecords([{ category: "totalprice", price: "500" }, { category: "sms", price: "9" }]), 500);
});

test("料金が未確定の送信分を概算して実質残高を出す", () => {
  const summary = summarizeTwilioBilling({
    balance: 1805.01,
    currency: "JPY",
    usageRecords: [{ category: "phonenumbers-local", price: "185.6" }, { category: "sms", price: "9.4" }],
    messages: [
      { direction: "outbound-api", status: "delivered", price: null, num_segments: "4", date_created: "2026-09-27T14:12:59Z" },
      { direction: "outbound-api", status: "delivered", price: null, num_segments: "1", date_created: "2026-09-27T13:35:25Z" },
      { direction: "outbound-api", status: "failed", price: null, num_segments: "2", date_created: "2026-09-27T13:30:00Z" },
      { direction: "outbound-api", status: "delivered", price: "-14.36", num_segments: "2", date_created: "2026-09-02T01:00:00Z" },
      { direction: "outbound-api", status: "delivered", price: null, num_segments: "3", date_created: "2026-08-30T01:00:00Z" },
      { direction: "inbound", status: "received", price: "-1.34", num_segments: "1", date_created: "2026-09-27T14:00:00Z" },
    ],
    unitPrice: 14,
    now,
  });
  assert.equal(summary.pendingSegments, 5);
  assert.equal(summary.pendingEstimate, 70);
  assert.equal(Math.round(summary.effectiveBalance * 100) / 100, 1735.01);
  assert.equal(summary.monthUsage, 185.6 + 9.4 + 70);
  assert.equal(summary.monthOutboundMessages, 4);
  assert.equal(summary.monthOutboundSegments, 9);
  assert.equal(summary.low, false);
});

test("料金表が取れないときは日本宛ての標準料金で概算する", () => {
  const summary = summarizeTwilioBilling({
    balance: 100,
    currency: "JPY",
    usageRecords: [],
    messages: [{ direction: "outbound-api", status: "sent", price: null, num_segments: "1", date_created: "2026-09-27T00:00:00Z" }],
    unitPrice: null,
    now,
  });
  assert.equal(summary.pendingEstimate, 14.36);
  assert.equal(summary.low, true);
});

test("残高が少ない間は1日1回まで知らせ、送れなかったときは次の確認で送り直す", () => {
  const low = { low: true };
  assert.equal(shouldSendBalanceAlert({ low: false }, null, now), false);
  assert.equal(shouldSendBalanceAlert(low, null, now), true);
  assert.equal(shouldSendBalanceAlert(low, { created_at: "2026-09-27T12:00:00Z", delivered: true }, now), false);
  assert.equal(shouldSendBalanceAlert(low, { created_at: "2026-09-27T02:59:00Z", delivered: true }, now), true);
  assert.equal(shouldSendBalanceAlert(low, { created_at: "2026-09-28T02:00:00Z", delivered: false }, now), true);
});

test("通知文に実質残高・今月の使用額・チャージ先を入れる", () => {
  const message = buildBalanceAlertMessage({
    currency: "JPY", balance: 1000, pendingSegments: 20, pendingEstimate: 287.2, effectiveBalance: 712.8,
    monthUsage: 1287.2, monthOutboundMessages: 30, monthOutboundSegments: 70, unitPrice: 14.36,
    threshold: 1000, low: true, checkedAt: now.toISOString(),
  });
  assert.match(message, /残り 約713円/);
  assert.match(message, /今月の使用額 約1,287円（送信30通・70通分）/);
  assert.match(message, /https:\/\/console\.twilio\.com\//);
});
