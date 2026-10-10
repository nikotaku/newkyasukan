// 予約のルームを、そのセラピストのその日の出勤（shifts.room）から決める。
// WEB予約・セラピスト専用フォームの予約はルームが空で入るので、予約表を開いたときに埋めて保存する。

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
    .map((shift) => (shift.room ?? "").trim())
    .filter(Boolean))];
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
