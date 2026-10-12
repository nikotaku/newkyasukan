import { test } from "node:test";
import assert from "node:assert/strict";
import { prefillFromRequest, requestIdFromSearch, sortRequests, type EstamaReservationRequest } from "../src/lib/estamaReservationRequests.ts";

const base: EstamaReservationRequest = {
  id: "00000000-0000-0000-0000-000000000001", received_at: null, hope_date: "2026-10-13", hope_time: "01:30:00",
  nomination_label: "さくら🔰(26)", is_free: false, cast_name: "さくら", cast_id: "cast-1",
  course_label: "艶華コース", course_minutes: 80, course_price: 19000, nomination_fee: 1000, total_price: 20000,
  coupon: "新規割", request_note: "SMSで連絡ください", visit_kind: "新規予約", member_label: "エステ魂会員",
  customer_name: "山田", customer_phone: "09000000001", customer_email: null,
  check_status: "ok", check_note: null, status: "new", reservation_id: null,
};

test("深夜の予約は前の日の25時台として入れる", () => {
  const p = prefillFromRequest(base);
  assert.equal(p.start_time, "25:30");
  assert.equal(p.reservation_date.getDate(), 12);
  assert.equal(p.cast_id, "cast-1");
  assert.equal(p.duration, 80);
  assert.match(p.notes, /エステ魂の仮予約/);
  assert.match(p.notes, /ご要望：SMSで連絡ください/);
});

test("ダミー・いない名前はセラピストを空にする", () => {
  assert.equal(prefillFromRequest({ ...base, check_status: "dummy" }).cast_id, "");
  assert.equal(prefillFromRequest({ ...base, check_status: "unknown_cast", cast_id: null }).cast_id, "");
  const free = prefillFromRequest({ ...base, is_free: true, cast_id: null, hope_time: "13:00:00", check_status: "free" });
  assert.equal(free.start_time, "13:00");
  assert.equal(free.nomination_type, "none");
});

test("URLと並び順", () => {
  assert.equal(requestIdFromSearch(`?estama=${base.id}`), base.id);
  assert.equal(requestIdFromSearch("?estama=x"), null);
  const sorted = sortRequests([
    { id: "done", status: "registered" as const, hope_date: "2026-10-14", hope_time: "12:00" },
    { id: "late", status: "new" as const, hope_date: "2026-10-13", hope_time: "18:00" },
    { id: "early", status: "new" as const, hope_date: "2026-10-12", hope_time: "18:00" },
  ]);
  assert.deepEqual(sorted.map((r) => r.id), ["early", "late", "done"]);
});
