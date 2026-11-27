import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingSettlements, pendingSettlementUrl, settlementDayLabel } from "../src/lib/pendingSettlements.ts";

test("まだ承認していない精算だけ、新しい順に、同じ日・同じ人は1件", () => {
  const list = pendingSettlements(
    [
      { cast_id: "a", date: "2026-11-26", created_at: "2026-11-26T14:00:00Z" },
      { cast_id: "a", date: "2026-11-26", created_at: "2026-11-26T14:05:00Z" },
      { cast_id: "b", date: "2026-11-26", created_at: "2026-11-26T15:00:00Z" },
      { cast_id: "c", date: "2026-11-25", created_at: "2026-11-25T15:00:00Z" },
      { cast_id: "a", date: "2026-11-25", created_at: "2026-11-25T13:00:00Z" },
      { cast_id: null, date: "2026-11-26", created_at: "2026-11-26T16:00:00Z" },
    ],
    [{ cast_id: "c", date: "2026-11-25" }],
  );
  assert.deepEqual(list.map((x) => `${x.castId}${x.date.slice(8)}`), ["b26", "a26", "a25"]);
  assert.equal(list[1].submittedAt, "2026-11-26T14:05:00Z");
});

test("開くURLと日付の表示", () => {
  assert.equal(pendingSettlementUrl({ castId: "x", date: "2026-11-26" }), "/sales/daily-sales?date=2026-11-26&cast=x");
  assert.equal(settlementDayLabel("2026-11-26"), "11/26(木)");
});
