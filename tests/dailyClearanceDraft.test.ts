import assert from "node:assert/strict";
import test from "node:test";
import {
  isFinalizedDailyClearance,
  resolveDraftTherapistBack,
} from "../src/lib/dailyClearanceDraft.ts";

test("途中保存後に予約売上が変わったら最新の自動バックへ戻す", () => {
  const result = resolveDraftTherapistBack({
    clearance: {
      status: "draft",
      total_sales: 59_000,
      therapist_back: 42_000,
      draft_saved_at: "2026-10-08T09:09:01.000Z",
    },
    currentTotalSales: 89_000,
    currentAutoBack: 62_000,
    reservationUpdatedAts: ["2026-10-08T10:25:59.000Z"],
  });
  assert.deepEqual(result, { therapistBack: 62_000, recalculated: true });
});

test("同額でも予約が途中保存後に更新されたら再計算する", () => {
  const result = resolveDraftTherapistBack({
    clearance: {
      status: "draft",
      total_sales: 30_000,
      therapist_back: 18_000,
      draft_saved_at: "2026-10-08T09:00:00.000Z",
    },
    currentTotalSales: 30_000,
    currentAutoBack: 20_000,
    reservationUpdatedAts: ["2026-10-08T09:10:00.000Z"],
  });
  assert.deepEqual(result, { therapistBack: 20_000, recalculated: true });
});

test("予約が変わっていない途中保存は手入力値を保持する", () => {
  const result = resolveDraftTherapistBack({
    clearance: {
      status: "draft",
      total_sales: 30_000,
      therapist_back: 21_000,
      draft_saved_at: "2026-10-08T10:00:00.000Z",
    },
    currentTotalSales: 30_000,
    currentAutoBack: 20_000,
    reservationUpdatedAts: ["2026-10-08T09:10:00.000Z"],
  });
  assert.deepEqual(result, { therapistBack: 21_000, recalculated: false });
});

test("途中保存は清算済みとして扱わない", () => {
  assert.equal(isFinalizedDailyClearance({ status: "draft", cleared_at: null }), false);
  assert.equal(isFinalizedDailyClearance({ status: "pending", cleared_at: "2026-10-08T12:00:00Z" }), true);
});
