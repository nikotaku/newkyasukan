import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBannerText, resolveBannerText, bannerImageFor, castHeroBannersForDay, isNewcomer, selectCastHeroBanners } from "../src/lib/castHeroBanners.ts";

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

test("バナー内の文言を個別に変更し、自動の名前・時刻を差し込む", () => {
  const banners = selectCastHeroBanners([{ ...casts[0], banner_text: {
    badge: "限定2日間", name: "りりか＆ももか", age: "", shift: "限定イベント {start}〜{end}",
    available: "ご予約は {next} から", booking: "特別コースを予約", store: "{store} 仙台",
  }}], shifts, "2026-11-05");
  const text = resolveBannerText(banners[0], "艶華", "15:00");
  assert.equal(text.badge, "限定2日間");
  assert.equal(text.name, "りりか＆ももか");
  assert.equal(text.age, "");
  assert.equal(text.shift, "限定イベント 13:00〜22:00");
  assert.equal(text.availability, "ご予約は 15:00 から");
  assert.equal(text.booking, "特別コースを予約");
  assert.equal(text.store, "艶華 仙台");
  assert.equal(resolveBannerText(banners[0], "艶華").availability, "");
  assert.equal(resolveBannerText({ ...banners[0], isNewcomer: true, text: { newcomerBadge: "新人限定" } }, "艶華").badge, "新人限定");
});

test("空欄は非表示、未設定は従来の文言、受付終了は別の文言", () => {
  const banner = selectCastHeroBanners(casts, shifts, "2026-11-05").find((item) => item.castId === "a")!;
  assert.equal(resolveBannerText(banner, "艶華", "16:00").booking, "あいさんを予約する");
  assert.equal(resolveBannerText(banner, "艶華", "16:00").availability, "最短 16:00〜 ご案内できます");
  assert.equal(resolveBannerText({ ...banner, text: { badge: "", shift: "", booking: "", store: "", closed: "受付完了" } }, "艶華", null).availability, "受付完了");
  const hidden = resolveBannerText({ ...banner, text: { badge: "", shift: "", booking: "", store: "" } }, "艶華");
  assert.equal(hidden.badge, "");
  assert.equal(hidden.shift, "");
  assert.equal(hidden.booking, "");
  assert.equal(hidden.store, "");
  assert.deepEqual(normalizeBannerText({ badge: 1, booking: null, store: "", unknown: "ignored" }), { store: "" });
  assert.deepEqual(normalizeBannerText(null), {});
});
