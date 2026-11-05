// トップページのトップバナーに出す「セラピストのバナー」を、その日の出勤と素材から選んで並べる。
//   素材：casts.banner_images（写真）・banner_copy（キャッチコピー）・banner_enabled
//   出す人：その営業日に出勤する人のうち、素材がある人
//   並び順：新人（入店から30日）を先に。あとは日付で毎日先頭が入れ替わる（同じ人がいつも1枚目にならない）
//   写真：日ごとに順番に替わる
// テスト: npm run test:cast-hero-banners

// 文字の未設定は従来の自動表示、空文字は非表示。個別のバナーだけに適用する。
export const BANNER_TEXT_DEFAULTS = {
  badge: "TODAY",
  newcomerBadge: "NEW FACE",
  name: "{name}",
  age: "（{age}）",
  shift: "本日出勤 {start}〜{end}",
  available: "最短 {next}〜 ご案内できます",
  closed: "本日の受付は終了しました",
  booking: "{name}さんを予約する",
  store: "{store}",
};
export type BannerText = Partial<Record<keyof typeof BANNER_TEXT_DEFAULTS, string>>;
export const BANNER_TEXT_LABELS: Record<keyof BannerText, string> = {
  badge: "通常の見出し（TODAY）", newcomerBadge: "新人の見出し（NEW FACE）",
  name: "表示名", age: "年齢", shift: "出勤時間の行", available: "最短案内の行",
  closed: "受付終了時の行", booking: "予約ボタン", store: "店舗名",
};
export function normalizeBannerText(value: unknown): BannerText {
  const result: BannerText = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const key of Object.keys(BANNER_TEXT_DEFAULTS) as (keyof BannerText)[]) {
    const text = (value as Record<string, unknown>)[key];
    if (typeof text === "string") result[key] = text.slice(0, 160);
  }
  return result;
}
export function resolveBannerText(banner: CastHeroBanner, storeName: string, nextAvailable?: string | null) {
  const templates = { ...BANNER_TEXT_DEFAULTS, ...normalizeBannerText(banner.text) };
  const variables: Record<string, string> = {
    name: banner.name, age: banner.age == null ? "" : String(banner.age),
    start: banner.start, end: banner.end, next: nextAvailable ?? "", store: storeName,
  };
  const fill = (value: string) => value.replace(/\{(name|age|start|end|next|store)\}/g, (_, key: string) => variables[key]);
  return {
    badge: fill(banner.isNewcomer ? templates.newcomerBadge : templates.badge),
    name: fill(templates.name), age: banner.age == null && templates.age.includes("{age}") ? "" : fill(templates.age),
    shift: fill(templates.shift),
    availability: nextAvailable === undefined ? "" : fill(nextAvailable ? templates.available : templates.closed),
    booking: fill(templates.booking), store: fill(templates.store),
  };
}

export interface BannerCast {
  id: string;
  name: string;
  age?: number | null;
  join_date?: string | null;
  banner_images?: string[] | null;
  banner_copy?: string | null;
  banner_text?: unknown;
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
  text?: BannerText;
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
      text: normalizeBannerText(cast.banner_text),
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

export type BannerShiftRow = BannerShift & {
  casts: (BannerCast & { is_active?: boolean | null; is_visible?: boolean | null }) | null;
};

/**
 * その日の出勤（shifts と casts を一緒に読んだ行）から、HPのトップと同じ決め方でバナーを並べる。
 * 出勤中で表示しているセラピストだけ・1人1つの出勤（早い方）。HPのトップ・/banner-render・エステ魂のカバー画像で共通。
 */
export function castHeroBannersForDay(rows: BannerShiftRow[], date: string, max = MAX_CAST_BANNERS) {
  const seen = new Set<string>();
  const usable = [...rows]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .filter((row) => {
      if (!row.casts?.is_active || !row.casts?.is_visible || seen.has(row.cast_id)) return false;
      seen.add(row.cast_id);
      return true;
    });
  const casts = usable.flatMap((row) => (row.casts ? [row.casts] : []));
  return selectCastHeroBanners(casts, usable, date, max);
}
