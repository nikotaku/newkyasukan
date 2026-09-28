import assert from "node:assert/strict";
import test from "node:test";

import { monthlyEarnings } from "../src/lib/earnings.ts";
import { DEFAULT_SIM_INPUT, simulate } from "../src/lib/simulator.ts";

test("登録→面談→入店の流れを広告費と率から出す", () => {
  const { months } = simulate({ ...DEFAULT_SIM_INPUT, adSpend: 500000, cpa: 10000, organic: 10, interviewRate: 0.5, joinRate: 0.4, months: 1 });
  assert.equal(months[0].registrations, 60);
  assert.equal(months[0].interviews, 30);
  assert.equal(months[0].joins, 12);
});

test("掲載店舗は解約率を引いてから新規を足す", () => {
  const { months } = simulate({ ...DEFAULT_SIM_INPUT, storesStart: 10, storesNewPerMonth: 5, storeChurn: 0.1, months: 3 });
  assert.equal(months[0].stores, 10);
  assert.equal(months[1].stores, 14);
  assert.ok(Math.abs(months[2].stores - 17.6) < 1e-9);
});

test("売上は掲載料だけ。費用は広告＋コーチ＋固定費", () => {
  const input = { ...DEFAULT_SIM_INPUT, storesStart: 20, avgFee: 50000, adSpend: 300000, coachCost: 250000, fixedCost: 100000, months: 1 };
  const { months } = simulate(input);
  assert.equal(months[0].revenue, 1000000);
  assert.equal(months[0].cost, 300000 + months[0].coaches * 250000 + 100000);
  assert.equal(months[0].profit, months[0].revenue - months[0].cost);
});

test("コーチの人数は担当人数を上限で割って切り上げる（最低1人）", () => {
  const few = simulate({ ...DEFAULT_SIM_INPUT, adSpend: 0, organic: 1, interviewRate: 1, joinRate: 0, coachCapacity: 25, months: 1 });
  assert.equal(few.months[0].coaches, 1);
  const many = simulate({ ...DEFAULT_SIM_INPUT, adSpend: 0, organic: 60, interviewRate: 1, joinRate: 0, coachCapacity: 25, months: 1 });
  assert.equal(many.months[0].coaches, 3);
});

test("伴走期間中の入店者もコーチの担当に数える", () => {
  const { months } = simulate({ ...DEFAULT_SIM_INPUT, adSpend: 0, organic: 10, interviewRate: 1, joinRate: 0.5, retention: 1, coachingMonths: 2, months: 3 });
  // 面談10人 ＋ 当月入店5人 ＋ 前月入店5人（2か月目以降）
  assert.equal(months[0].coachingLoad, 15);
  assert.equal(months[1].coachingLoad, 20);
  assert.equal(months[2].coachingLoad, 20);
});

test("黒字化する月と累積赤字の底を返す", () => {
  const summary = simulate(DEFAULT_SIM_INPUT);
  assert.ok(summary.worstCumulative < 0);
  if (summary.breakEvenMonth !== null) {
    assert.ok(summary.months[summary.breakEvenMonth - 1].profit >= 0);
    for (const m of summary.months.slice(0, summary.breakEvenMonth - 1)) assert.ok(m.profit < 0);
  }
});

test("月収の目安：週3日×1日3本×8,000円、指名3割×2,000円", () => {
  const result = monthlyEarnings({ daysPerWeek: 3, sessionsPerDay: 3, backPer60: 8000, nominationRate: 0.3, nominationFee: 2000 });
  assert.ok(Math.abs(result.sessions - 38.7) < 1e-9);
  assert.ok(Math.abs(result.total - (38.7 * 8000 + 38.7 * 0.3 * 2000)) < 1e-6);
});
