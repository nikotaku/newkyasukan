import assert from "node:assert/strict";
import test from "node:test";
import {
  heroBannerDestination,
  isRirikaMomokaCampaign,
  RIRIKA_MOMOKA_BOOKING_PATH,
  RIRIKA_MOMOKA_CAMPAIGN,
  RIRIKA_MOMOKA_CAST_ID,
  ririkaMomokaDate,
} from "../src/lib/ririkaMomokaCampaign.ts";

test("りりか&ももかのキャストだけを限定企画の対象にする", () => {
  assert.equal(isRirikaMomokaCampaign(RIRIKA_MOMOKA_CAST_ID), true);
  assert.equal(isRirikaMomokaCampaign("00000000-0000-0000-0000-000000000000"), false);
});

test("限定企画は11月17日と18日の出勤時間だけを持つ", () => {
  assert.equal(RIRIKA_MOMOKA_CAMPAIGN.dates.length, 2);
  assert.deepEqual(ririkaMomokaDate("2026-11-17"), {
    date: "2026-11-17",
    label: "11月17日（火）",
    hours: "13:00〜25:00",
    startMinutes: 780,
    endMinutes: 1500,
  });
  assert.equal(ririkaMomokaDate("2026-11-19"), null);
});

test("企画バナーだけを専用予約フォームへ送る", () => {
  assert.equal(heroBannerDestination("https://enka-salon.jp/banners/ririka-momoka-hp-202611.png"), RIRIKA_MOMOKA_BOOKING_PATH);
  assert.equal(heroBannerDestination("https://example.com/normal-banner.png"), "/schedule");
});
