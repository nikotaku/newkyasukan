export const ENKA_FALLBACK_HERO_BANNER =
  "https://imrxzkivwrkqbhqfbbes.supabase.co/storage/v1/object/public/cast-photos/image-stock/1784811500002_enka-hero-open.jpg";

export function normalizeHeroBanners(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const url = entry.trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}
