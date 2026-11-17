import assert from "node:assert/strict";
import test from "node:test";

import { businessDateLong, businessDateShort, businessDateTime } from "../src/lib/businessTime.ts";

test("6時前の予約は前日の24時台・25時台で書く", () => {
  const midnight = businessDateTime("2026-11-18", "00:00:00");
  assert.equal(midnight?.date, "2026-11-17");
  assert.equal(midnight?.time, "24:00");
  assert.equal(businessDateLong(midnight), "11月17日(火)");
  assert.equal(businessDateShort(midnight), "11/17(火)");
  assert.equal(businessDateTime("2026-11-18", "01:30")?.time, "25:30");
  assert.equal(businessDateTime("2026-11-18", "05:59")?.time, "29:59");
});

test("6時以降はそのまま・月またぎもずれない", () => {
  const evening = businessDateTime("2026-11-17", "20:40:00");
  assert.equal(evening?.date, "2026-11-17");
  assert.equal(evening?.time, "20:40");
  assert.equal(businessDateTime("2026-11-17", "06:00")?.time, "06:00");
  assert.equal(businessDateTime("2026-12-01", "02:00")?.date, "2026-11-30");
  assert.equal(businessDateTime("2027-01-01", "00:10")?.date, "2026-12-31");
});

test("時刻が無い・日付が読めないとき", () => {
  assert.equal(businessDateTime("2026-11-18", null)?.time, "");
  assert.equal(businessDateTime("2026-11-18", null)?.date, "2026-11-18");
  assert.equal(businessDateTime(null, "00:00"), null);
  assert.equal(businessDateShort(null), "");
});
