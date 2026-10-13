import assert from "node:assert/strict";
import test from "node:test";

import { findNextAvailableStart, isAvailabilitySlotOpen } from "../src/lib/availability.ts";
import {
  breakMinutes,
  formatShiftBreak,
  isOnBreak,
  overlapsBreaks,
  shiftBreakRange,
  shiftBreaks,
  validateShiftBreak,
} from "../src/lib/shiftBreak.ts";

const day = { start_time: "13:00", end_time: "23:00" };
const night = { start_time: "20:00:00", end_time: "04:00:00" };

test("休憩の時間（分）", () => {
  assert.deepEqual(shiftBreakRange({ ...day, break_start: "18:00", break_end: "19:00" }), { start: 1080, end: 1140 });
  // 日をまたぐ出勤の深夜の休憩は24時以降
  assert.deepEqual(shiftBreakRange({ ...night, break_start: "00:30:00", break_end: "01:30:00" }), { start: 1470, end: 1530 });
  // 0時をまたぐ休憩
  assert.deepEqual(shiftBreakRange({ ...night, break_start: "23:30", break_end: "00:30" }), { start: 1410, end: 1470 });
  assert.equal(shiftBreakRange({ ...day, break_start: null, break_end: null }), null);
  assert.equal(shiftBreakRange({ ...day, break_start: "12:00", break_end: "13:30" }), null); // 出勤の外
  assert.equal(breakMinutes({ ...day, break_start: "18:00", break_end: "19:00" }), 60);
});

test("入力のチェック", () => {
  assert.equal(validateShiftBreak({ ...day, break_start: "", break_end: "" }), null);
  assert.equal(validateShiftBreak({ ...day, break_start: "18:00", break_end: "" }), "休憩の開始と終了を両方入れてください");
  assert.equal(validateShiftBreak({ ...day, break_start: "22:30", break_end: "23:30" }), "休憩は出勤の時間の中で入れてください");
  assert.equal(validateShiftBreak({ ...day, break_start: "18:00", break_end: "19:00" }), null);
  assert.equal(formatShiftBreak({ ...day, break_start: "18:00:00", break_end: "19:00:00" }), "休憩 18:00〜19:00");
  assert.equal(formatShiftBreak(day), "");
});

test("出勤開始の数え方に合わせる（朝6時前を+24時間で数える画面）", () => {
  const early = { start_time: "02:00", end_time: "05:00", break_start: "03:00", break_end: "03:30" };
  assert.deepEqual(shiftBreaks(early), [{ start: 180, end: 210 }]);
  assert.deepEqual(shiftBreaks(early, 26 * 60), [{ start: 27 * 60, end: 27 * 60 + 30 }]);
});

test("休憩は空き枠に出さない", () => {
  const breaks = shiftBreaks({ ...day, break_start: "18:00", break_end: "19:00" });
  // 17:30 からの60分は休憩にかかる → 休憩明けの19:00
  assert.equal(findNextAvailableStart({ shiftStart: 780, shiftEnd: 1380, currentTime: 1050, reservations: [], breaks }), 1140);
  // 休憩中に開いたら休憩明け
  assert.equal(findNextAvailableStart({ shiftStart: 780, shiftEnd: 1380, currentTime: 1090, reservations: [], breaks }), 1140);
  // 休憩の前に60分入るならそのまま
  assert.equal(findNextAvailableStart({ shiftStart: 780, shiftEnd: 1380, currentTime: 1000, reservations: [], breaks }), 1000);
  // 予約のインターバルは休憩の前後に足さない（17:00まで予約＋20分 → 次は休憩明け）
  assert.equal(findNextAvailableStart({ shiftStart: 780, shiftEnd: 1380, currentTime: 900, reservations: [{ start: 900, duration: 120 }], breaks }), 1140);
  assert.equal(isAvailabilitySlotOpen({ slotStart: 1050, duration: 60, shiftStart: 780, shiftEnd: 1380, reservations: [], breaks }), false);
  assert.equal(isAvailabilitySlotOpen({ slotStart: 1140, duration: 60, shiftStart: 780, shiftEnd: 1380, reservations: [], breaks }), true);
  assert.equal(isAvailabilitySlotOpen({ slotStart: 1020, duration: 60, shiftStart: 780, shiftEnd: 1380, reservations: [], breaks }), true);
  assert.ok(overlapsBreaks(1100, 1200, breaks));
  assert.ok(!overlapsBreaks(1140, 1200, breaks));
  assert.ok(isOnBreak(1080, breaks));
  assert.ok(!isOnBreak(1140, breaks));
});

test("休憩なしは今まで通り", () => {
  assert.equal(findNextAvailableStart({ shiftStart: 780, shiftEnd: 1380, currentTime: 1050, reservations: [] }), 1050);
});
