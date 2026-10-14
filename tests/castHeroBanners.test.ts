import assert from "node:assert/strict";
import test from "node:test";

import { bannerImageFor, castHeroBannersForDay, isNewcomer, selectCastHeroBanners } from "../src/lib/castHeroBanners.ts";

const casts = [
  { id: "a", name: "あい", banner_images: ["https://x/a1.jpg", "https://x/a2.jpg"], banner_copy: "笑顔", join_date: "2026-01-01" },
  { id: "b", name: "べに", banner_images: ["https://x/b1.jpg"], join_date: "2026-01-01" },
  { id: "c", name: "ちさ", banner_images: ["https://x/c1.jpg"], join_date: "2026-10-01" }, // 新人
  { id: "d", name: "でぃあ", banner_images: [], join_date: "2026-01-01" }, // 素材なし
  { id: "e", name: "えま", banner_images: ["https://x/e1.jpg"], banner_enabled: false }, // 出さない
];
const shifts = [
  { cast_id: "a", start_time: "13:00:00", end_time: "22:00:00" },
  { cast_id: "b", start_time: "18:00:00", end_time: "02:00:00" },
  { cast_id: "c", start_time: "12:00:00", end_time: "20:00:00" },
  { cast_id: "d", start_time: "12:00:00", end_time: "20:00:00" },
  { cast_id: "e", start_time: "12:00:00", end_time: "20:00:00" },
];

test("その日出勤する素材のある人だけ・新人が先頭", () => {
  const banners = selectCastHeroBanners(casts, shifts, "2026-10-14");
  assert.deepEqual(banners.map((banner) => banner.castId).sort(), ["a", "b", "c"]);
  assert.equal(banners[0].castId, "c");
  assert.equal(banners[0].isNewcomer, true);
  assert.equal(banners.find((banner) => banner.castId === "b")?.start, "18:00");
  assert.equal(banners.find((banner) => banner.castId === "a")?.copy, "笑顔");
});

test("日付で先頭が入れ替わる・写真が日ごとに替わる", () => {
  const day1 = selectCastHeroBanners(casts, shifts, "2026-10-14").filter((banner) => !banner.isNewcomer).map((banner) => banner.castId);
  const day2 = selectCastHeroBanners(casts, shifts, "2026-10-15").filter((banner) => !banner.isNewcomer).map((banner) => banner.castId);
  assert.notDeepEqual(day1, day2);
  assert.notEqual(bannerImageFor(["https://x/1.jpg", "https://x/2.jpg"], "2026-10-14"), bannerImageFor(["https://x/1.jpg", "https://x/2.jpg"], "2026-10-15"));
  assert.equal(bannerImageFor(["not-a-url"], "2026-10-14"), null);
});

test("新人は入店から30日", () => {
  assert.equal(isNewcomer("2026-10-01", "2026-10-14"), true);
  assert.equal(isNewcomer("2026-09-01", "2026-10-14"), false);
  assert.equal(isNewcomer(null, "2026-10-14"), false);
});

test("その日の出勤から：辞めた・非表示の人を除き、1人1つの出勤（早い方）", () => {
  const cast = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, banner_images: ["https://x/" + id + ".jpg"], is_active: true, is_visible: true, ...extra });
  const rows = [
    { cast_id: "a", start_time: "18:00:00", end_time: "23:00:00", casts: cast("a") },
    { cast_id: "a", start_time: "12:00:00", end_time: "16:00:00", casts: cast("a") },
    { cast_id: "b", start_time: "12:00:00", end_time: "20:00:00", casts: cast("b", { is_visible: false }) },
    { cast_id: "c", start_time: "12:00:00", end_time: "20:00:00", casts: cast("c", { is_active: false }) },
    { cast_id: "d", start_time: "12:00:00", end_time: "20:00:00", casts: null },
  ];
  const banners = castHeroBannersForDay(rows, "2026-10-14");
  assert.deepEqual(banners.map((banner) => banner.castId), ["a"]);
  assert.equal(banners[0].start, "12:00");
});
