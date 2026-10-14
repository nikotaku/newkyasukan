import assert from "node:assert/strict";
import test from "node:test";

import { assignCoverSlots, bannerRenderUrl } from "../server/estama-cover-slots.ts";

const banner = (castId: string) => ({
  castId, name: castId, age: null, image: `https://x/${castId}.jpg`, copy: "", start: "12:00", end: "20:00", isNewcomer: false,
});

test("カバー画像：選んだ枠に先頭のバナーから入れる", () => {
  const result = assignCoverSlots([3, 2], [banner("a"), banner("b"), banner("c")]);
  assert.deepEqual(result.map((item) => [item.slot, item.banner.castId]), [[2, "a"], [3, "b"]]);
});

test("カバー画像：バナーが枠より少なければ、余った枠はそのまま", () => {
  assert.deepEqual(assignCoverSlots([1, 2, 3], [banner("a")]).map((item) => item.slot), [1]);
  assert.deepEqual(assignCoverSlots([2, 3], []), []);
});

test("カバー画像：1〜3以外の枠・重複は使わない", () => {
  assert.deepEqual(assignCoverSlots([0, 2, 2, 4], [banner("a"), banner("b")]).map((item) => item.slot), [2]);
});

test("バナーを画像にする画面のURL", () => {
  assert.equal(
    bannerRenderUrl("https://example.com/", "s1", "2026-10-14", "c1"),
    "https://example.com/banner-render?store=s1&date=2026-10-14&cast=c1",
  );
});
