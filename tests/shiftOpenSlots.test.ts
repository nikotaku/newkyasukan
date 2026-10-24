import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShiftBoard,
  datesBetween,
  formatMinutes,
  freeRanges,
  nextShiftPeriod,
  shiftPeriodLabel,
  shiftPeriodRange,
} from "../src/lib/shiftOpenSlots.ts";

test("空いている時間：埋まった時間を営業時間（12:00〜26:00）から引く。3時間未満は空きにしない", () => {
  assert.deepEqual(freeRanges([]), [{ start: 720, end: 1560 }]);
  // 12:00〜21:00 が埋まっている → 21:00〜26:00（5時間）
  assert.deepEqual(freeRanges([{ start: 720, end: 1260 }]), [{ start: 1260, end: 1560 }]);
  // 14:00〜26:00 → 前の2時間は短いので空きにしない
  assert.deepEqual(freeRanges([{ start: 840, end: 1560 }]), []);
  assert.equal(formatMinutes(1560), "26:00");
});

test("ルームごとの空き・自分の出勤・ルーム未定の申請", () => {
  const board = buildShiftBoard(["2026-11-01", "2026-11-02"], ["艶月", "華月"], [
    { date: "2026-11-01", room: "艶月", start: "12:00:00", end: "02:00:00", mine: false, approval: "approved" },
    { date: "2026-11-01", room: "華月", start: "12:00:00", end: "20:00:00", mine: true, approval: "approved" },
    { date: "2026-11-02", room: null, start: "12:00:00", end: "22:00:00", mine: false, approval: "pending" },
  ]);
  assert.deepEqual(board[0].open, [{ room: "華月", start: 1200, end: 1560 }]);
  assert.equal(board[0].mine.length, 1);
  assert.equal(board[1].open.length, 2);
  assert.equal(board[1].pendingWithoutRoom, 1);
});

test("期間の名前・範囲・次の半月", () => {
  assert.equal(shiftPeriodLabel("2026-11-01", "2026-11-15"), "11月前期");
  assert.equal(shiftPeriodLabel("2026-11-16", "2026-11-30"), "11月後期");
  assert.equal(shiftPeriodLabel("2026-11-01", "2026-11-30"), "11月");
  assert.equal(shiftPeriodLabel("2026-11-03", "2026-11-20"), "11/3〜11/20");
  assert.deepEqual(shiftPeriodRange("2026-02", "second"), { start: "2026-02-16", end: "2026-02-28" });
  assert.deepEqual(nextShiftPeriod("2026-10-24"), { month: "2026-11", half: "first" });
  assert.deepEqual(nextShiftPeriod("2026-12-03"), { month: "2026-12", half: "second" });
  assert.deepEqual(nextShiftPeriod("2026-12-20"), { month: "2027-01", half: "first" });
  assert.equal(datesBetween("2026-11-01", "2026-11-15").length, 15);
});
