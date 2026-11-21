import test from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  defaults,
  judgment,
  type Data,
} from "../src/lib/monthlyShiftKpi.ts";
const settings = () => ({
  ...defaults(),
  members: [
    { id: "a", name: "A", target: 10, training: "" },
    { id: "b", name: "B", target: 10, training: "" },
    { id: "c", name: "C", target: 10, training: "" },
    { id: "d", name: "D", target: 10, training: "" },
  ],
});
const empty = (): Data => ({
  settings: [],
  casts: [],
  shifts: [],
  reservations: [],
  clearances: [],
});
test("same person/date deduplicated, forecast distinct, missing settlement is null", () => {
  const d = empty();
  d.shifts = [
    {
      cast_id: "a",
      date: "2027-01-01",
      start: "11:00",
      end: "15:00",
      room: "華月",
    },
    {
      cast_id: "a",
      date: "2027-01-01",
      start: "16:00",
      end: "23:00",
      room: "華月",
    },
  ];
  d.reservations = [
    ...Array.from({ length: 3 }, () => ({
      cast_id: "a",
      date: "2027-01-01",
      status: "completed",
      price: 30000,
    })),
    { cast_id: "a", date: "2027-01-02", status: "confirmed", price: 30000 },
  ];
  const r = summarize(d, "2027-01", settings(), "2027-01-03");
  assert.equal(r.planned, 1);
  assert.equal(r.actual, 1);
  assert.equal(r.done, 3);
  assert.equal(r.forecast, 1);
  assert.equal(r.rate, 100);
  assert.equal(r.sales, null);
});
test("month total does not imply daily target; zero-treatment settled day is actual", () => {
  const d = empty();
  d.clearances = [
    { cast_id: "a", date: "2027-01-01", sales: 120000, back: 60000 },
    { cast_id: "a", date: "2027-01-02", sales: 0, back: 0 },
  ];
  d.reservations = Array.from({ length: 4 }, () => ({
    cast_id: "a",
    date: "2027-01-01",
    status: "completed",
    price: 30000,
  }));
  const r = summarize(d, "2027-01", settings(), "2027-02-01");
  assert.equal(r.actual, 2);
  assert.equal(r.rate, 50);
  assert.equal(r.profit, 60000);
});
test("overlapping residents, W and blocked room union, overnight handling", () => {
  const d = empty();
  d.casts = [{ id: "w", name: "W", kind: "w_group" }];
  d.shifts = [
    {
      cast_id: "a",
      date: "2027-01-01",
      start: "11:00",
      end: "20:00",
      room: "華月",
    },
    {
      cast_id: "w",
      date: "2027-01-01",
      start: "16:00",
      end: "02:00",
      room: "華月",
    },
  ];
  d.reservations = [
    { cast_id: "w", date: "2027-01-01", status: "completed", price: 90000 },
  ];
  const s = settings();
  s.blocks = [
    { date: "2027-01-01", room: "華月", start: "18:00", end: "23:00" },
  ];
  const r = summarize(d, "2027-01", s, "2027-02-01");
  assert.equal(r.remaining, 92);
  assert.equal(r.whole, 92);
  assert.equal(r.resident, 0.6);
  assert.equal(r.other, 0.4);
  assert.equal(r.wDone, 1);
  assert.equal(r.done, 0);
});
test("unassigned rooms cannot be advertised as free; closed days excluded", () => {
  const d = empty();
  d.shifts = [
    {
      cast_id: "a",
      date: "2027-01-01",
      start: "11:00",
      end: "20:00",
      room: null,
    },
  ];
  const s = settings();
  s.closed = ["2027-01-02"];
  const r = summarize(d, "2027-01", s, "2027-01-02");
  assert.equal(r.capacity, 90);
  assert.equal(r.remaining, null);
  assert.equal(r.whole, null);
});
test("future month no alert, elapsed-day progress and thresholds", () => {
  assert.equal(judgment(0, 40, 80, 0), "開始前");
  assert.equal(judgment(4, 40, 80, 0.1), "達成");
  assert.equal(judgment(32, 40, 80), "要改善");
  assert.equal(judgment(31, 40, 80), "未達");
  assert.equal(
    summarize(empty(), "2027-02", settings(), "2027-01-01").progress,
    0,
  );
});
