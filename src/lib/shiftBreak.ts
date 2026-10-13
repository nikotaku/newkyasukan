// シフトの中休み（休憩）。shifts.break_start / break_end（どちらも入っているときだけ有効）。
// 休憩の時間は空き枠に出さず、予約も入れない（準備のインターバルは足さない）。
// 時刻は出勤開始からの「営業日の分」で扱う（日をまたぐ出勤の 0:30 は 24:30 = 1470）。
// テスト: npm run test:shift-break

export interface ShiftBreakFields {
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
}

export interface MinuteRange {
  start: number;
  end: number;
}

const toMinutes = (time: string | null | undefined) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** 出勤の時間（分）。日をまたぐ出勤は終わりに24時間を足す */
export function shiftRange(shift: Pick<ShiftBreakFields, "start_time" | "end_time">): MinuteRange | null {
  const start = toMinutes(shift.start_time);
  const rawEnd = toMinutes(shift.end_time);
  if (start === null || rawEnd === null || start === rawEnd) return null;
  return { start, end: rawEnd < start ? rawEnd + 24 * 60 : rawEnd };
}

/** 休憩の時間（分）。出勤の中に収まらない・未設定なら null */
export function shiftBreakRange(shift: ShiftBreakFields): MinuteRange | null {
  const range = shiftRange(shift);
  const rawStart = toMinutes(shift.break_start);
  const rawEnd = toMinutes(shift.break_end);
  if (!range || rawStart === null || rawEnd === null || rawStart === rawEnd) return null;
  const start = rawStart < range.start ? rawStart + 24 * 60 : rawStart;
  let end = rawEnd < range.start ? rawEnd + 24 * 60 : rawEnd;
  if (end <= start) end += 24 * 60;
  if (start < range.start || end > range.end) return null;
  return { start, end };
}

/**
 * 空き枠の計算に渡す休憩（無ければ空）。
 * 呼ぶ側が出勤開始を別の数え方（朝6時前を+24時間など）にしているときは、その開始の分を shiftStart に渡すとそろえる。
 */
export const shiftBreaks = (shift: ShiftBreakFields, shiftStart?: number): MinuteRange[] => {
  const range = shiftBreakRange(shift);
  if (!range) return [];
  const offset = shiftStart === undefined ? 0 : shiftStart - (shiftRange(shift)?.start ?? shiftStart);
  return [{ start: range.start + offset, end: range.end + offset }];
};

/** 枠（開始〜終了、分）が休憩にかかるか */
export const overlapsBreaks = (start: number, end: number, breaks: MinuteRange[] | undefined) =>
  (breaks ?? []).some((range) => start < range.end && end > range.start);

/** その時刻（分）が休憩中か */
export const isOnBreak = (minute: number, breaks: MinuteRange[] | undefined) =>
  (breaks ?? []).some((range) => minute >= range.start && minute < range.end);

const hhmm = (time: string | null | undefined) => (time ?? "").slice(0, 5);

/** 「休憩 18:00〜19:00」。未設定なら空文字 */
export function formatShiftBreak(shift: ShiftBreakFields) {
  return shiftBreakRange(shift) ? `休憩 ${hhmm(shift.break_start)}〜${hhmm(shift.break_end)}` : "";
}

/**
 * 入力のチェック。両方空ならOK（休憩なし）。片方だけ・出勤の外・同じ時刻はエラー文を返す。
 */
export function validateShiftBreak(shift: ShiftBreakFields): string | null {
  const hasStart = Boolean(hhmm(shift.break_start));
  const hasEnd = Boolean(hhmm(shift.break_end));
  if (!hasStart && !hasEnd) return null;
  if (!hasStart || !hasEnd) return "休憩の開始と終了を両方入れてください";
  if (!shiftRange(shift)) return null;
  return shiftBreakRange(shift) ? null : "休憩は出勤の時間の中で入れてください";
}

/** 保存用：空欄は null */
export const breakValue = (time: string | null | undefined) => (hhmm(time) ? hhmm(time) : null);

/** 休憩の長さ（分） */
export const breakMinutes = (shift: ShiftBreakFields) => {
  const range = shiftBreakRange(shift);
  return range ? range.end - range.start : 0;
};
