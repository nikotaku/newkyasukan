export const RIRIKA_MOMOKA_CAST_ID = "3155fd7c-8b35-48ea-a6f8-12d3eb7dd0c2";
export const RIRIKA_MOMOKA_BOOKING_PATH = "/r/3155fd7c";
export const RIRIKA_MOMOKA_HP_BANNER = "/banners/ririka-momoka-hp-202611.png";
export const RIRIKA_MOMOKA_ESTAMA_BANNER = "/banners/ririka-momoka-estama-202611.png";

export const RIRIKA_MOMOKA_CAMPAIGN = {
  capacity: 8,
  headline: "東京から、姉妹で仙台へ。",
  story:
    "東京を拠点に活動する姉妹が、ふたりだからこそ届けられる特別なW施術を仙台でも体験してほしいという想いから、艶華へ。11月17日・18日の2日間だけの限定出勤です。",
  members: [
    {
      name: "ももか",
      role: "姉",
      catchphrase: "包み込むような、大人の癒し",
      description: "落ち着いた空気とやさしい距離感で、心までほどける時間をお届けします。",
    },
    {
      name: "りりか",
      role: "妹",
      catchphrase: "無邪気な可愛さと、圧強めの本格施術",
      description: "可愛らしい雰囲気とのギャップが魅力。しっかりした施術が好きな方にもおすすめです。",
    },
  ],
  dates: [
    { date: "2026-11-17", label: "11月17日（火）", hours: "13:00〜25:00", startMinutes: 13 * 60, endMinutes: 25 * 60 },
    { date: "2026-11-18", label: "11月18日（水）", hours: "12:00〜19:30", startMinutes: 12 * 60, endMinutes: 19 * 60 + 30 },
  ],
} as const;

export const isRirikaMomokaCampaign = (castId?: string | null) =>
  castId === RIRIKA_MOMOKA_CAST_ID;

export const ririkaMomokaDate = (date: string) =>
  RIRIKA_MOMOKA_CAMPAIGN.dates.find((item) => item.date === date) ?? null;

export const heroBannerDestination = (url: string) =>
  url.includes("ririka-momoka-hp-202611.png") ? RIRIKA_MOMOKA_BOOKING_PATH : "/schedule";
