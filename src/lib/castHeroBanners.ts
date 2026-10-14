// トップページのトップバナーに出す「セラピストのバナー」を、その日の出勤と素材から選んで並べる。
//   素材：casts.banner_images（写真）・banner_copy（キャッチコピー）・banner_enabled
//   出す人：その営業日に出勤する人のうち、素材がある人
//   並び順：新人（入店から30日）を先に。あとは日付で毎日先頭が入れ替わる（同じ人がいつも1枚目にならない）
//   写真：日ごとに順番に替わる
// テスト: npm run test:cast-hero-banners

export interface BannerCast {
  id: string;
  name: string;
  age?: number | null;
  join_date?: string | null;
  banner_images?: string[] | null;
  banner_copy?: string | null;
  banner_enabled?: boolean | null;
}

export interface BannerShift {
  cast_id: string;
  start_time: string;
  end_time: string;
}

export interface CastHeroBanner {
  castId: string;
  name: string;
  age: number | null;
  image: string;
  copy: string;
  start: string;
  end: string;
  isNewcomer: boolean;
}

export const NEWCOMER_DAYS = 30;
export const MAX_CAST_BANNERS = 8;

const dayNumber = (date: string) => Math.floor(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000);

export function isNewcomer(joinDate: string | null | undefined, date: string) {
  if (!joinDate || !/^\d{4}-\d{2}-\d{2}/.test(joinDate)) return false;
  const days = dayNumber(date) - dayNumber(joinDate.slice(0, 10));
  return days >= 0 && days < NEWCOMER_DAYS;
}

/** その日の写真（日ごとに順番に） */
export function bannerImageFor(images: string[], date: string, offset = 0) {
  const usable = images.filter((url) => /^https?:\/\//i.test(url));
  if (!usable.length) return null;
  return usable[(dayNumber(date) + offset) % usable.length];
}

/**
 * その日のセラピストのバナー。date は営業日（YYYY-MM-DD）。
 * 同じ人の出勤が2つあれば早い方を使う。
 */
export function selectCastHeroBanners(casts: BannerCast[], shifts: BannerShift[], date: string, max = MAX_CAST_BANNERS): CastHeroBanner[] {
  const castById = new Map(casts.map((cast) => [cast.id, cast]));
  const firstShift = new Map<string, BannerShift>();
  for (const shift of [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    if (!firstShift.has(shift.cast_id)) firstShift.set(shift.cast_id, shift);
  }
  const candidates: CastHeroBanner[] = [];
  for (const [castId, shift] of firstShift) {
    const cast = castById.get(castId);
    if (!cast || cast.banner_enabled === false) continue;
    const image = bannerImageFor(cast.banner_images ?? [], date, candidates.length);
    if (!image) continue;
    candidates.push({
      castId,
      name: cast.name,
      age: cast.age ?? null,
      image,
      copy: (cast.banner_copy ?? "").trim(),
      start: shift.start_time.slice(0, 5),
      end: shift.end_time.slice(0, 5),
      isNewcomer: isNewcomer(cast.join_date, date),
    });
  }
  // 名前順にそろえてから、日付で回す（毎日先頭が1人ずつずれる）
  const regulars = candidates.filter((banner) => !banner.isNewcomer).sort((a, b) => a.castId.localeCompare(b.castId));
  const newcomers = candidates.filter((banner) => banner.isNewcomer).sort((a, b) => a.castId.localeCompare(b.castId));
  const rotate = <T,>(list: T[]) => {
    if (list.length < 2) return list;
    const shift = dayNumber(date) % list.length;
    return [...list.slice(shift), ...list.slice(0, shift)];
  };
  return [...rotate(newcomers), ...rotate(regulars)].slice(0, max);
}
