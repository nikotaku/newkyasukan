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
