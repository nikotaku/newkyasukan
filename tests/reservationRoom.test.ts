import assert from "node:assert/strict";
import test from "node:test";

import { missingRoomFills, roomFromShifts } from "../src/lib/reservationRoom.ts";

const shifts = [
  { cast_id: "a", room: "艶月" },
  { cast_id: "b", room: " 華月 " },
  { cast_id: "c", room: null },
  { cast_id: "d", room: "艶月" },
  { cast_id: "d", room: "華月" },
];

test("その日の出勤のルーム（1つに決まるときだけ）", () => {
  assert.equal(roomFromShifts(shifts, "a"), "艶月");
  assert.equal(roomFromShifts(shifts, "b"), "華月");
  assert.equal(roomFromShifts(shifts, "c"), null);
  assert.equal(roomFromShifts(shifts, "d"), null);
  assert.equal(roomFromShifts(shifts, "x"), null);
  assert.equal(roomFromShifts(shifts, null), null);
});

test("ルームが空の予約だけ出勤のルームで埋める（入っている・取り消し済みはそのまま）", () => {
  const fills = missingRoomFills([
    { id: "1", cast_id: "a", room: null, status: "confirmed" },
    { id: "2", cast_id: "a", room: "", status: "confirmed" },
    { id: "3", cast_id: "a", room: "華月", status: "confirmed" },
    { id: "4", cast_id: "a", room: null, status: "cancelled" },
    { id: "5", cast_id: "c", room: null, status: "confirmed" },
    { id: "6", cast_id: "b", room: null, status: "completed" },
  ], shifts);
  assert.deepEqual(fills, [
    { id: "1", room: "艶月" },
    { id: "2", room: "艶月" },
    { id: "6", room: "華月" },
  ]);
});

test("予約詳細のルームの注意", async () => {
  const { roomIssue } = await import("../src/lib/reservationRoom.ts");
  const rooms = ["艶月", "華月"];
  assert.deepEqual(roomIssue("", "艶月", rooms), { kind: "missing", expected: "艶月" });
  assert.deepEqual(roomIssue(null, null, rooms), { kind: "missing", expected: null });
  assert.deepEqual(roomIssue("つや月", "艶月", rooms), { kind: "unknown", room: "つや月" });
  assert.deepEqual(roomIssue("華月", "艶月", rooms), { kind: "mismatch", room: "華月", expected: "艶月" });
  assert.equal(roomIssue("艶月", "艶月", rooms), null);
  assert.equal(roomIssue("艶月", null, rooms), null);
});

test("お客様の確認", async () => {
  const { guideConfirmation } = await import("../src/lib/reservationRoom.ts");
  assert.equal(guideConfirmation(null, null, "艶月"), "none");
  assert.equal(guideConfirmation("2026-10-12T10:00:00Z", "艶月", "艶月"), "confirmed");
  assert.equal(guideConfirmation("2026-10-12T10:00:00Z", "華月", "艶月"), "stale");
});
