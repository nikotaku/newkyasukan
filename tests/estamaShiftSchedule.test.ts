import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyEstamaScheduleDate,
  estamaIndividualShiftAdminUrl,
  estamaOutsideRangeMessage,
  estamaScheduleDatesFromFieldNames,
  estamaScheduleExpectation,
} from "../server/estama-shift-schedule.ts";

test("エスたま登録IDがあれば本人の出勤設定画面へ直接移動する", () => {
  assert.equal(
    estamaIndividualShiftAdminUrl("925606"),
    "https://estama.jp/admin/schedule/925606/",
  );
});

test("エスたま登録IDがなければ一覧画面の処理へ戻せる", () => {
  assert.equal(estamaIndividualShiftAdminUrl(null), null);
  assert.equal(estamaIndividualShiftAdminUrl("  "), null);
});

test("通常シフトと深夜シフトをエスたまの選択値へ変換する", () => {
  assert.deepEqual(estamaScheduleExpectation("upsert", "14:00:00", "22:00:00"), {
    start: "14:00",
    end: "22:00",
  });
  assert.deepEqual(estamaScheduleExpectation("upsert", "15:00:00", "02:00:00"), {
    start: "15:00",
    end: "25:00",
  });
});

test("削除同期では開始・終了を未出勤へ戻す", () => {
  assert.deepEqual(estamaScheduleExpectation("delete", "18:00:00", "23:00:00"), {
    start: "",
    end: "",
  });
});

const twoWeekFieldNames = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8, 25 + index)).toISOString().slice(0, 10);
  return [
    `column[${date}][select][select_start]`,
    `column[${date}][select][select_end]`,
    `column[${date}][period][12:00]`,
  ];
}).flat();

test("出勤設定画面の開始時刻欄から登録できる日付を読む", () => {
  const dates = estamaScheduleDatesFromFieldNames([...twoWeekFieldNames, "csrf_token", "column[bad][select][select_start]"]);
  assert.equal(dates.length, 14);
  assert.equal(dates[0], "2026-09-25");
  assert.equal(dates[13], "2026-10-08");
});

test("画面にある2週間分の日付は登録対象にする", () => {
  const dates = estamaScheduleDatesFromFieldNames(twoWeekFieldNames);
  assert.deepEqual(classifyEstamaScheduleDate(dates, "2026-09-25"), { state: "ready" });
  assert.deepEqual(classifyEstamaScheduleDate(dates, "2026-10-08"), { state: "ready" });
});

test("2週間より先の日付は失敗ではなく期間外として保留する", () => {
  const dates = estamaScheduleDatesFromFieldNames(twoWeekFieldNames);
  assert.deepEqual(classifyEstamaScheduleDate(dates, "2026-10-09"), {
    state: "outside_range",
    firstDate: "2026-09-25",
    lastDate: "2026-10-08",
  });
  assert.equal(classifyEstamaScheduleDate(dates, "2026-09-24").state, "outside_range");
  assert.match(estamaOutsideRangeMessage("2026-09-25", "2026-10-08"), /2026-09-25〜2026-10-08.*外のため保留/);
});

test("出勤表が1日分も無い画面は非掲載の可能性として区別する", () => {
  assert.deepEqual(classifyEstamaScheduleDate([], "2026-09-30"), { state: "no_schedule" });
  assert.deepEqual(estamaScheduleDatesFromFieldNames(["keyword", "column[2026-09-30][work_status]"]), []);
});
