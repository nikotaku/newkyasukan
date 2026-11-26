import { test } from "node:test";
import assert from "node:assert/strict";
import {
  achievement,
  goalAudience,
  isGoalTarget,
  monthActual,
  parseGoalNumber,
  shiftMonthCounts,
  type GoalReservation,
} from "../src/lib/castGoals.ts";

test("ゴールの対象：在籍と、出勤した月が2か月以上の出稼ぎ", () => {
  assert.equal(goalAudience(["在籍"], 0), "zaiseki");
  assert.equal(goalAudience([], 0), "zaiseki");
  assert.equal(goalAudience(["出稼ぎ"], 1), "dekasegi");
  assert.equal(goalAudience(["出稼ぎ", "スタンダード"], 3), "repeat");
  assert.ok(isGoalTarget("repeat"));
  assert.ok(!isGoalTarget("dekasegi"));
});

test("出勤した月の数", () => {
  const counts = shiftMonthCounts([
    { cast_id: "a", shift_date: "2026-10-01" },
    { cast_id: "a", shift_date: "2026-10-20" },
    { cast_id: "a", shift_date: "2026-11-02" },
    { cast_id: "b", shift_date: "2026-11-02" },
  ]);
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), 1);
});

const r = (over: Partial<GoalReservation>): GoalReservation => ({
  cast_id: "a", reservation_date: "2026-11-10", start_time: "20:00:00", status: "completed",
  price: 20000, nomination_type: "ネット指名", ...over,
});

test("その月の実績：完了だけ数え、本指名（姫予約を含む）の率、確定は予定", () => {
  const list = [
    r({}),
    r({ nomination_type: "本指名" }),
    r({ nomination_type: "姫予約", price: 24000 }),
    r({ status: "cancelled" }),
    r({ status: "confirmed", price: 19000 }),
    r({ cast_id: "b" }),
    // 12/1 の朝3時＝11/30 の営業日（11月に入る）
    r({ reservation_date: "2026-12-01", start_time: "03:00:00" }),
    // 11/1 の朝3時＝10/31 の営業日（11月に入らない）
    r({ reservation_date: "2026-11-01", start_time: "03:00:00" }),
  ];
  const a = monthActual(list, "a", "2026-11");
  assert.equal(a.count, 4);
  assert.equal(a.sales, 84000);
  assert.equal(a.honshimei, 2);
  assert.equal(a.honshimeiRate, 50);
  assert.equal(a.plannedCount, 1);
  assert.equal(a.plannedSales, 19000);
  assert.equal(monthActual([], "a", "2026-11").honshimeiRate, null);
});

test("達成率と入力の読み取り", () => {
  assert.equal(achievement(30, 40), 75);
  assert.equal(achievement(5, 0), null);
  assert.equal(achievement(null, 40), null);
  assert.equal(parseGoalNumber("１,２００,０００円", { max: 100000000 }), 1200000);
  assert.equal(parseGoalNumber("35.5%", { max: 100, decimals: 1 }), 35.5);
  assert.equal(parseGoalNumber("150", { max: 100, decimals: 1 }), 100);
  assert.equal(parseGoalNumber("", { max: 100 }), null);
  assert.equal(parseGoalNumber("abc", { max: 100 }), null);
});
