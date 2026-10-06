import assert from "node:assert/strict";
import test from "node:test";

import { businessMonth, monthLabel, normalizeMonthlyCounts, shiftMonth, totalCount } from "../src/lib/therapistMonthlyCount.ts";

test("営業月は朝6時で切り替える（1日の朝5時台は前の月）", () => {
  assert.equal(businessMonth(new Date(2026, 9, 1, 5, 59)), "2026-09");
  assert.equal(businessMonth(new Date(2026, 9, 1, 6, 0)), "2026-10");
  assert.equal(businessMonth(new Date(2026, 0, 1, 3, 0)), "2025-12");
});

test("月の切り替えと表示", () => {
  assert.equal(shiftMonth("2026-10", -1), "2026-09");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(monthLabel("2026-10", "2026-10"), "10月");
  assert.equal(monthLabel("2025-12", "2026-01"), "2025年12月");
});

test("RPCの結果をそろえる（足りない値は0、指名なしはフリー）", () => {
  const counts = normalizeMonthlyCounts({
    month: "2026-09",
    done: 21,
    scheduled: "2",
    nominations: [{ label: "ネット指名", done: 15, scheduled: 1 }, { label: null, done: 6 }],
    durations: [{ minutes: 90, done: 10, scheduled: 0 }, { minutes: null, done: 1 }],
    days: [{ date: "2026-09-03", done: 2, scheduled: 0 }, { date: null, done: 1 }],
  }, "2026-09");
  assert.equal(counts.done, 21);
  assert.equal(counts.scheduled, 2);
  assert.equal(totalCount(counts), 23);
  assert.deepEqual(counts.nominations[1], { label: "フリー", done: 6, scheduled: 0 });
  assert.equal(counts.durations.length, 1);
  assert.deepEqual(counts.days, [{ date: "2026-09-03", done: 2, scheduled: 0 }]);
  // 読めなかったとき（トークン違いで null）は0本
  assert.deepEqual(normalizeMonthlyCounts(null, "2026-10"),
    { month: "2026-10", done: 0, scheduled: 0, nominations: [], durations: [], days: [] });
});
