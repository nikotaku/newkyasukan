import assert from "node:assert/strict";
import test from "node:test";

import { expiresAtFromDate, noticeTargets, readSummary, unreadCount } from "../src/lib/therapistNotices.ts";

const casts = [
  { id: "a", name: "テストA" },
  { id: "b", name: "テストB" },
  { id: "c", name: "テストC" },
];

test("宛先：空なら全員、決めた人ならその人だけ", () => {
  assert.equal(noticeTargets({ target_cast_ids: null }, casts).length, 3);
  assert.equal(noticeTargets({ target_cast_ids: [] }, casts).length, 3);
  assert.deepEqual(noticeTargets({ target_cast_ids: ["b"] }, casts).map((c) => c.id), ["b"]);
});

test("確認した人・まだの人", () => {
  const reads = [{ notice_id: "n1", cast_id: "a" }, { notice_id: "n2", cast_id: "b" }];
  const summary = readSummary({ id: "n1", target_cast_ids: null }, casts, reads);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.read.map((c) => c.id), ["a"]);
  assert.deepEqual(summary.unread.map((c) => c.id), ["b", "c"]);
  assert.equal(readSummary({ id: "n2", target_cast_ids: ["b"] }, casts, reads).unread.length, 0);
});

test("まだ確認していない数・掲載期限", () => {
  assert.equal(unreadCount([{ read_at: null }, { read_at: "2026-10-24T00:00:00Z" }, { read_at: null }]), 2);
  assert.equal(expiresAtFromDate("2026-11-30"), "2026-11-30T23:59:59+09:00");
  assert.equal(expiresAtFromDate(""), null);
});
