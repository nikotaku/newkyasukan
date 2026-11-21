import { canonicalRoomName } from "./storeRooms.ts";
export const KPI_ROOMS = ["艶月", "華月", "朧月"];
export interface Member {
  id: string | null;
  name: string;
  target: number;
  training: string;
}
export interface Settings {
  slots: number;
  treatments: number;
  perShift: number;
  unitPrice: number;
  warning: number;
  members: Member[];
  closed: string[];
  blocks: { date: string; room: string; start: string; end: string }[];
}
export interface SettingsRow {
  month: string;
  settings: Settings;
  locked: boolean;
  revision: number;
}
export interface Data {
  settings: SettingsRow[];
  casts: { id: string; name: string; kind: string }[];
  shifts: {
    cast_id: string;
    date: string;
    start: string;
    end: string;
    room: string | null;
  }[];
  reservations: {
    cast_id: string;
    date: string;
    status: string;
    price: number;
  }[];
  clearances: { cast_id: string; date: string; sales: number; back: number }[];
}
export const defaults = (): Settings => ({
  slots: 40,
  treatments: 120,
  perShift: 3,
  unitPrice: 30000,
  warning: 80,
  members: Array.from({ length: 4 }, (_, i) => ({
    id: null,
    name: `対象者${i + 1}（未設定）`,
    target: 10,
    training: "",
  })),
  closed: [],
  blocks: [],
});
export const percent = (value: number, target: number) =>
  target > 0 ? (value / target) * 100 : 0;
export function judgment(
  value: number,
  target: number,
  warning: number,
  progress = 1,
) {
  if (progress === 0) return "開始前";
  const rate = percent(value, target * progress);
  return rate >= 100 ? "達成" : rate >= warning ? "要改善" : "未達";
}
function minute(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (h < 6 ? h + 24 : h) * 60 + m;
}
function union(intervals: number[][]) {
  const merged: number[][] = [];
  for (const [a, b] of intervals.sort((x, y) => x[0] - y[0])) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged.reduce((n, [a, b]) => n + b - a, 0);
}
export function summarize(
  data: Data,
  month: string,
  settings: Settings,
  today: string,
) {
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const dates = Array.from(
    { length: days },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  ).filter((d) => !settings.closed.includes(d));
  // Count fully elapsed business days; same-day partial performance does not trigger premature alerts.
  const progress = dates.length
    ? dates.filter((d) => d < today).length / dates.length
    : 0;
  const shifts = data.shifts.filter((s) => s.date.startsWith(month));
  const res = data.reservations.filter((r) => r.date.startsWith(month));
  const clear = data.clearances.filter((c) => c.date.startsWith(month));
  const wIds = new Set(
    data.casts.filter((c) => c.kind === "w_group").map((c) => c.id),
  );
  const members = settings.members.map((m) => {
    const rs = res.filter((r) => r.cast_id === m.id && !wIds.has(r.cast_id));
    const cs = clear.filter((c) => c.cast_id === m.id && !wIds.has(c.cast_id));
    const done = rs.filter((r) => r.status === "completed");
    const planned = new Set(
      shifts
        .filter((s) => s.cast_id === m.id && !wIds.has(s.cast_id))
        .map((s) => s.date),
    );
    const actual = new Set([
      ...done.map((r) => r.date),
      ...cs.map((c) => c.date),
    ]);
    const achieved = [...actual].filter(
      (d) => done.filter((r) => r.date === d).length >= settings.perShift,
    ).length;
    const missing = [...actual].filter(
      (d) => !cs.some((c) => c.date === d),
    ).length;
    // Do not mix provisional booking prices with finalized sales including options/discounts.
    const sales =
      missing || !actual.size ? null : cs.reduce((n, c) => n + c.sales, 0);
    const profit =
      sales === null ? null : sales - cs.reduce((n, c) => n + c.back, 0);
    return {
      ...m,
      planned: planned.size,
      actual: actual.size,
      done: done.length,
      forecast: rs.filter((r) => r.status === "confirmed").length,
      achieved,
      missing,
      sales,
      profit,
      unverified: [...planned].filter((d) => d < today && !actual.has(d))
        .length,
    };
  });
  const sum = (
    key: "planned" | "actual" | "done" | "forecast" | "achieved" | "unverified",
  ) => members.reduce((n, m) => n + m[key], 0);
  const ids = new Set(settings.members.map((m) => m.id).filter(Boolean));
  const roomIntervals = new Map<
    string,
    { all: number[][]; resident: number[][] }
  >();
  let unassigned = 0;
  for (const s of [
    ...shifts,
    ...settings.blocks.map((b) => ({ ...b, cast_id: "" })),
  ]) {
    if (!dates.includes(s.date)) continue;
    const room = canonicalRoomName(s.room);
    if (!room || !KPI_ROOMS.includes(room)) {
      unassigned++;
      continue;
    }
    const a = Math.max(660, minute(s.start));
    let b = minute(s.end);
    if (b < minute(s.start)) b += 1440;
    b = Math.min(1560, b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      unassigned++;
      continue;
    }
    const key = `${s.date}/${room}`;
    const entry = roomIntervals.get(key) ?? { all: [], resident: [] };
    entry.all.push([a, b]);
    if (ids.has(s.cast_id) && !wIds.has(s.cast_id)) entry.resident.push([a, b]);
    roomIntervals.set(key, entry);
  }
  const capacity = dates.length * 3;
  const occupied =
    [...roomIntervals.values()].reduce((n, e) => n + union(e.all), 0) / 900;
  const resident =
    [...roomIntervals.values()].reduce((n, e) => n + union(e.resident), 0) /
    900;
  const actual = sum("actual");
  const achieved = sum("achieved");
  const sales =
    members.some((m) => m.sales === null && m.actual > 0) || !actual
      ? null
      : members.reduce((n, m) => n + (m.sales ?? 0), 0);
  const profit =
    sales === null ? null : members.reduce((n, m) => n + (m.profit ?? 0), 0);
  return {
    members,
    progress,
    actual,
    done: sum("done"),
    planned: sum("planned"),
    forecast: sum("forecast"),
    achieved,
    rate: actual ? percent(achieved, actual) : null,
    sales,
    profit,
    unverified: sum("unverified"),
    capacity,
    resident,
    other: occupied - resident,
    remaining: unassigned ? null : capacity - occupied,
    whole: unassigned ? null : capacity - roomIntervals.size,
    unassigned,
    configured: settings.members.every((m) => m.id),
    wDone: res.filter((r) => wIds.has(r.cast_id) && r.status === "completed")
      .length,
    wSales: clear
      .filter((c) => wIds.has(c.cast_id))
      .reduce((n, c) => n + c.sales, 0),
  };
}
