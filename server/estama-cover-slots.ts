import type { CastHeroBanner } from "../src/lib/castHeroBanners.js";

// エステ魂のカバー画像（3枠）の、どの枠にどのバナーを入れるか。テスト: npm run test:estama（tests/estamaCoverBanners.test.ts）

export type CoverAssignment = { slot: number; banner: CastHeroBanner };

/** 枠（小さい順）に、バナーを先頭から入れる。バナーが枠より少ないときは、余った枠はそのまま（前の画像のまま） */
export function assignCoverSlots(slots: number[], banners: CastHeroBanner[]): CoverAssignment[] {
  const usable = [...new Set(slots)].filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 3).sort((a, b) => a - b);
  return usable.slice(0, banners.length).map((slot, index) => ({ slot, banner: banners[index] }));
}

/** バナーを画像にする画面（HPの /banner-render）のURL */
export function bannerRenderUrl(siteUrl: string, storeId: string, date: string, castId: string) {
  const params = new URLSearchParams({ store: storeId, date, cast: castId });
  return `${siteUrl.replace(/\/$/, "")}/banner-render?${params.toString()}`;
}
