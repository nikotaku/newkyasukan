// 空きシフト（ルームごとに、まだ誰も入っていない時間）。マイページの「空きシフト」とシフト提出の画面で使う。
// 営業は 12:00〜翌2:00 として、朝6時前の時刻は +24時間で数える。3時間以上あいているところだけを空きとする。

export const OPEN_START_MINUTES = 12 * 60;
export const OPEN_END_MINUTES = 26 * 60;
export const MIN_OPEN_MINUTES = 3 * 60;

export interface BoardShift {
  date: string; // yyyy-MM-dd（営業日）
  room: string | null;
  start: string; // HH:mm(:ss)
  end: string;
  mine: boolean;
  /** approved ＝ 確定 / pending ＝ 申請中 */
  approval: string;
}

export interface OpenSlot {
  room: string;
  start: number; // 分（26:00 = 1560）
  end: number;
}

export interface DayBoard {
  date: string;
  open: OpenSlot[];
  /** ルームの決まっていない申請（だれかが出したもの） */
  pendingWithoutRoom: number;
  mine: BoardShift[];
}

const toMinutes = (value: string) => {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  const minutes = (h || 0) * 60 + (m || 0);
  return h < 6 ? minutes + 24 * 60 : minutes;
};

export const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/** ある日・あるルームの空いている時間（埋まっている時間を営業時間から引く） */
export function freeRanges(busy: { start: number; end: number }[], from = OPEN_START_MINUTES, to = OPEN_END_MINUTES, min = MIN_OPEN_MINUTES) {
  const sorted = busy
    .map((b) => ({ start: Math.max(from, b.start), end: Math.min(to, b.end <= b.start ? b.end + 24 * 60 : b.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let cursor = from;
  for (const b of sorted) {
    if (b.start - cursor >= min) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (to - cursor >= min) out.push({ start: cursor, end: to });
  return out;
}

/** 期間の毎日について、ルームごとの空きと自分の出勤をまとめる */
export function buildShiftBoard(dates: string[], rooms: string[], shifts: BoardShift[]): DayBoard[] {
  return dates.map((date) => {
    const today = shifts.filter((s) => s.date === date);
    const open: OpenSlot[] = [];
    for (const room of rooms) {
      const busy = today.filter((s) => s.room === room).map((s) => ({ start: toMinutes(s.start), end: toMinutes(s.end) }));
      for (const range of freeRanges(busy)) open.push({ room, ...range });
    }
    return {
      date,
      open,
      pendingWithoutRoom: today.filter((s) => !s.room && !s.mine).length,
      mine: today.filter((s) => s.mine),
    };
  });
}

/** 期間の表示名：1〜15日＝前期、16日〜月末＝後期、1日〜月末＝その月 */
export function shiftPeriodLabel(start: string, end: string) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (!sy || !ey) return "";
  const lastDay = new Date(Date.UTC(sy, sm, 0)).getUTCDate();
  if (sy === ey && sm === em) {
    if (sd === 1 && ed === 15) return `${sm}月前期`;
    if (sd === 16 && ed === lastDay) return `${sm}月後期`;
    if (sd === 1 && ed === lastDay) return `${sm}月`;
  }
  return `${sm}/${sd}〜${em}/${ed}`;
}

/** 期間：month = "2026-11"、half = first（1〜15日）/ second（16日〜月末）/ all */
export function shiftPeriodRange(month: string, half: "first" | "second" | "all") {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  if (half === "first") return { start: pad(1), end: pad(15) };
  if (half === "second") return { start: pad(16), end: pad(lastDay) };
  return { start: pad(1), end: pad(lastDay) };
}

/** 今日から見た「次の半月」（15日までなら今月後期、16日以降なら来月前期） */
export function nextShiftPeriod(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  if (d <= 15) return { month: `${y}-${String(m).padStart(2, "0")}`, half: "second" as const };
  const next = new Date(Date.UTC(y, m, 1));
  return { month: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`, half: "first" as const };
}

export function datesBetween(start: string, end: string) {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && out.length < 62) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
