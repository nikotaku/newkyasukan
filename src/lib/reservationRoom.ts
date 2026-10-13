// 予約のルームを、そのセラピストのその日の出勤（shifts.room）から決める。
// WEB予約・セラピスト専用フォームの予約はルームが空で入るので、予約表を開いたときに埋めて保存する。
// ルームの呼び名（インルーム＝艶月、ラスルーム＝華月 など）は storeRooms.ts の canonicalRoomName でそろえて比べる。
import { canonicalRoomName } from "./storeRooms.ts";

export interface ShiftRoom {
  cast_id: string;
  room: string | null;
}

export interface ReservationRoom {
  id: string;
  cast_id: string;
  room: string | null;
  status: string;
}

/** その日の出勤のルーム。出勤が無い・ルームが空・ルームが2つ以上で決められないときは null */
export function roomFromShifts(shifts: ShiftRoom[], castId: string | null | undefined) {
  if (!castId) return null;
  const rooms = [...new Set(shifts
    .filter((shift) => shift.cast_id === castId)
    .map((shift) => canonicalRoomName(shift.room))
    .filter((room): room is string => Boolean(room)))];
  return rooms.length === 1 ? rooms[0] : null;
}

/** ルームが空の予約に、出勤のルームを入れる（取り消し済みは触らない） */
export function missingRoomFills(reservations: ReservationRoom[], shifts: ShiftRoom[]) {
  const fills: Array<{ id: string; room: string }> = [];
  for (const reservation of reservations) {
    if ((reservation.room ?? "").trim() || reservation.status === "cancelled") continue;
    const room = roomFromShifts(shifts, reservation.cast_id);
    if (room) fills.push({ id: reservation.id, room });
  }
  return fills;
}

export type RoomIssue =
  | { kind: "missing"; expected: string | null }
  | { kind: "unknown"; room: string }
  | { kind: "mismatch"; room: string; expected: string };

/**
 * 予約詳細に出すルームの注意。
 *  - missing：ルームが空（お客様の案内ページに住所が出ない）
 *  - unknown：ルーム管理に無い名前（案内ページに住所が出ない）
 *  - mismatch：そのセラピストのその日の出勤のルームと違う
 */
export function roomIssue(room: string | null | undefined, shiftRoom: string | null, knownRooms: string[]): RoomIssue | null {
  const current = canonicalRoomName(room);
  const expected = canonicalRoomName(shiftRoom);
  if (!current) return { kind: "missing", expected };
  const known = knownRooms.map(canonicalRoomName);
  if (known.length && !known.includes(current)) return { kind: "unknown", room: current };
  if (expected && expected !== current) return { kind: "mismatch", room: current, expected };
  return null;
}

/** お客様が案内ページで「予約内容を確認しました」を押したか。押した後にルームが変わったら stale */
export function guideConfirmation(confirmedAt: string | null | undefined, confirmedRoom: string | null | undefined, room: string | null | undefined) {
  if (!confirmedAt) return "none" as const;
  return canonicalRoomName(confirmedRoom) === canonicalRoomName(room) ? "confirmed" as const : "stale" as const;
}
