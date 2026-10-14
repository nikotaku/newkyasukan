import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBillingMail,
  daysUntilCardExpiry,
  evaluateWatch,
  isWorse,
  mailMatchesWatch,
  nextBillingAfter,
} from "../src/lib/subscriptionWatch.ts";

const now = new Date("2026-10-15T03:00:00Z"); // 10/15 12:00 JST

test("請求まわりのメールの見分け（停止の知らせを優先）", () => {
  assert.equal(classifyBillingMail("Your payment failed - action required"), "billing_failed");
  assert.equal(classifyBillingMail("【重要】お支払いが確認できませんでした"), "billing_failed");
  assert.equal(classifyBillingMail("Your project will be paused"), "billing_failed");
  assert.equal(classifyBillingMail("ご利用停止のお知らせ"), "billing_failed");
  assert.equal(classifyBillingMail("Your receipt from Example Inc"), "billing_paid");
  assert.equal(classifyBillingMail("【IVRy】ご請求金額のお知らせ"), "billing_paid");
  assert.equal(classifyBillingMail("【着信内容の報告通知】090-0000-0000からのお電話【IVRy】"), null);
});

test("メールの送り元でサブスクを見分ける", () => {
  assert.equal(mailMatchesWatch({ sender: "Supabase <billing@supabase.com>", subject: "Invoice" }, { service: "supabase" }), true);
  assert.equal(mailMatchesWatch({ sender: "noreply@example.com", subject: "Invoice" }, { service: "supabase" }), false);
  assert.equal(mailMatchesWatch({ sender: "noreply@example.com", subject: "ABCサーバー 請求書" }, { service: "other", mail_keywords: ["abcサーバー"] }), true);
});

test("次の請求日を1周期すすめる（月末に寄せる）", () => {
  assert.equal(nextBillingAfter("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextBillingAfter("2026-10-15", "monthly"), "2026-11-15");
  assert.equal(nextBillingAfter("2026-10-15", "yearly"), "2027-10-15");
});

test("カードの有効期限", () => {
  assert.equal(daysUntilCardExpiry("2026-10", now), 16);
  assert.equal(daysUntilCardExpiry("2026-09", now) !== null && daysUntilCardExpiry("2026-09", now)! < 0, true);
  assert.equal(daysUntilCardExpiry("10/28", now), null);
});

test("サービスに止まっていると言われたら停止", () => {
  const result = evaluateWatch({ service: "twilio" }, { probe: { level: "stopped", message: "アカウントが停止されています" } }, now);
  assert.equal(result.level, "stopped");
});

test("支払い失敗のメールが領収書より新しければ停止、古ければ問題なし", () => {
  const failedMail = { subject: "Payment failed", received_at: "2026-10-10T00:00:00Z" };
  assert.equal(evaluateWatch({ service: "supabase" }, { failedMail, paidMail: { subject: "Receipt", received_at: "2026-10-01T00:00:00Z" } }, now).level, "stopped");
  assert.equal(evaluateWatch({ service: "supabase" }, { failedMail, paidMail: { subject: "Receipt", received_at: "2026-10-12T00:00:00Z" } }, now).level, "ok");
});

test("請求日を3日過ぎて支払いの確認が無ければ要確認", () => {
  assert.equal(evaluateWatch({ service: "other", next_billing_date: "2026-10-10" }, {}, now).level, "warning");
  assert.equal(evaluateWatch({ service: "other", next_billing_date: "2026-10-10", last_paid_at: "2026-10-10T05:00:00Z" }, {}, now).level, "ok");
  assert.equal(evaluateWatch({ service: "other", next_billing_date: "2026-10-14" }, {}, now).level, "ok");
});

test("カードの有効期限が近い・切れている", () => {
  assert.equal(evaluateWatch({ service: "other", card_expiry: "2026-10" }, {}, now).level, "warning");
  assert.equal(evaluateWatch({ service: "other", card_expiry: "2026-08" }, {}, now).level, "stopped");
  assert.equal(evaluateWatch({ service: "other", card_expiry: "2028-08" }, {}, now).level, "ok");
});

test("通知が何日も届かなければ要確認（取り込みが動いているときだけ）", () => {
  const watch = { service: "ivry", silence_days: 3 };
  assert.equal(evaluateWatch(watch, { activityTracked: true, lastActivityAt: "2026-10-10T00:00:00Z" }, now).level, "warning");
  assert.equal(evaluateWatch(watch, { activityTracked: true, lastActivityAt: "2026-10-14T00:00:00Z" }, now).level, "ok");
  // 取り込みが動いていなければ確かめられない（問題なしとは言わない）
  assert.equal(evaluateWatch(watch, { activityTracked: false }, now).level, "unknown");
});

test("材料が何も無ければ不明", () => {
  assert.equal(evaluateWatch({ service: "other" }, {}, now).level, "unknown");
});

test("悪くなったときだけ知らせる", () => {
  assert.equal(isWorse("stopped", "ok"), true);
  assert.equal(isWorse("warning", "stopped"), false);
  assert.equal(isWorse("unknown", "ok"), false);
  assert.equal(isWorse("warning", null), true);
});
