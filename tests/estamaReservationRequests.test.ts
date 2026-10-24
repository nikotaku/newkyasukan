import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogPrefill, prefillFromRequest, requestIdFromSearch, sortRequests, type EstamaReservationRequest } from "../src/lib/estamaReservationRequests.ts";

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

// 料金表（架空の金額）
const catalog = {
  backRates: [
    { course_type: "艶華", duration: 60, customer_price: 15000 },
    { course_type: "艶華", duration: 80, customer_price: 19000 },
    { course_type: "エスたま限定", duration: 70, customer_price: 20000 },
    { course_type: "エスたま限定", duration: 110, customer_price: 32000 },
  ],
  nominationRates: [
    { nomination_type: "ネット指名", customer_price: 1000 },
    { nomination_type: "本指名", customer_price: 2000 },
  ],
  optionRates: [{ option_name: "DR10" }, { option_name: "DR100" }, { option_name: "オプションパック -牡丹-" }],
  discounts: [
    { id: "d1", name: "事前予約限定クーポン❷", is_active: true },
    { id: "d2", name: "クーポン利用", is_active: true },
  ],
};

test("コース・指名・オプション・クーポンを料金表に当てはめる", () => {
  const p = catalogPrefill({ ...base, option_label: "オプションパック-牡丹-", coupon: "【事前予約限定クーポン❷】 【利用条件】 前日まで" }, catalog);
  assert.equal(p.course_type, "艶華");
  assert.equal(p.duration, 80);
  assert.equal(p.nomination_type, "ネット指名");
  assert.deepEqual(p.selectedOptions, ["オプションパック -牡丹-"]);
  assert.deepEqual(p.discount_ids, ["d1"]);
  assert.deepEqual(p.unmatched, []);
});

test("会員限定のプランはエスたま限定のコース（料金で決める）", () => {
  const p = catalogPrefill({ ...base, course_label: "【会員限定】110分リラックスプラン", course_minutes: 100, course_price: 32000, is_free: true, coupon: null }, catalog);
  assert.equal(p.course_type, "エスたま限定");
  assert.equal(p.duration, 110);
  assert.equal(p.nomination_type, "none");
});

test("長い名前のオプションから当てる・分からないものは残す", () => {
  assert.deepEqual(catalogPrefill({ ...base, option_label: "DR100", coupon: null }, catalog).selectedOptions, ["DR100"]);
  const unknown = catalogPrefill({ ...base, option_label: "アロマ", coupon: "新規割 ご新規様1000円オフ" }, catalog);
  assert.deepEqual(unknown.selectedOptions, []);
  assert.equal(unknown.unmatched.length, 2);
});

test("エステ魂のクーポンの文面から、同じ名前の割引を当てる（名前の後ろの（…）は無くてもよい）", () => {
  const estamaCatalog = {
    ...catalog,
    discounts: [
      { id: "new", name: "新規割 ご新規様1000円オフ", is_active: true },
      { id: "line", name: "¥2,000×5枚=総額¥10,000（公式LINE）", is_active: true },
      { id: "10k", name: "予約時に使える¥10,000クーポン（総額10,000円クーポン）", is_active: true },
    ],
  };
  const pick = (coupon: string) => catalogPrefill({ ...base, coupon }, estamaCatalog).discount_ids;
  assert.deepEqual(pick("新規割 ご新規様1000円オフ"), ["new"]);
  assert.deepEqual(pick("¥2,000×5枚=総額¥10,000!今日から使える! 公式LINE登録後、トークで「クーポン」と送信"), ["line"]);
  assert.deepEqual(pick("【予約時に使える】¥10,000クーポン|条件は2つだ ご予約時にすぐ使えるクーポンです。"), ["10k"]);
});
