import { estamaBlogUrl, estamaXProfileUrl } from "../../server/estama-sns-links.ts";

export type EstamaCastRecord = {
  name: string;
  bust?: number | null;
  bust_size?: string | null;
  cup_size?: string | null;
  waist?: number | null;
  hip?: number | null;
  body_size?: string | null;
  features?: string[] | null;
  photos?: string[] | null;
  photo?: string | null;
  shop_comment?: string | null;
  therapist_comment?: string | null;
  profile?: string | null;
  message?: string | null;
  therapist_years?: number | null;
  therapist_experience?: string | null;
  age?: number | null;
  height?: number | null;
  blood_type?: string | null;
  favorite_techniques?: string | null;
  favorite_food?: string | null;
  ideal_type?: string | null;
  celebrity_lookalike?: string | null;
  celebrity_like?: string | null;
  day_off_activities?: string | null;
  hobby?: string | null;
  hobbies?: string | null;
  blog_url?: string | null;
  x_account?: string | null;
  o2_url?: string | null;
  instagram_url?: string | null;
  estama_profile_url?: string | null;
};

const cut = (value: unknown, max: number) => String(value ?? "").slice(0, max);

export const ESTAMA_FEATURE_MAP: Record<string, string> = {
  "新人": "1", "経験豊富": "2", "業界未経験": "3", "施術上手": "28", "上品": "25",
  "甘えん坊": "4", "おとなしい": "5", "おっとり": "7", "明るい": "8", "優しい": "32",
  "努力家": "30", "礼儀正しい": "27", "清楚系": "9", "天然系": "10", "セクシー系": "11",
  "お姉様系": "12", "お嬢様系": "29", "ギャル系": "19", "美人系": "20", "熟女系": "21",
  "かわいい系": "22", "アイドル系": "24", "癒し系": "23", "妹系": "26",
  "モデル体型": "16", "小柄": "31", "色白肌": "18",
};

export function castToEstama(cast: EstamaCastRecord) {
  let sizeB = "";
  let sizeCup = "";
  const bust = String(cast.bust_size || `${cast.bust || ""}${cast.cup_size || ""}`).trim();
  const bustFirst = bust.match(/^(\d+)\s*([A-La-l])$/);
  const cupFirst = bust.match(/^([A-La-l])\s*(\d+)$/);
  if (bustFirst) [sizeB, sizeCup] = [bustFirst[1], bustFirst[2].toUpperCase()];
  else if (cupFirst) [sizeCup, sizeB] = [cupFirst[1].toUpperCase(), cupFirst[2]];
  else if (/^[A-La-l]$/.test(bust)) sizeCup = bust.toUpperCase();
  else sizeB = bust.replace(/\D/g, "").slice(0, 3);

  const fallbackBodySize = [cast.bust, cast.waist, cast.hip].every((value) => value !== null && value !== undefined)
    ? `${cast.bust}/${cast.waist}/${cast.hip}`
    : "";
  const bodyParts = String(cast.body_size || fallbackBodySize).split(/[-–/／]/);
  const numeric = bodyParts.map((part) => part.replace(/\D/g, ""));
  if (!sizeB && numeric.length >= 3) sizeB = numeric[0];
  const sizeW = numeric.length >= 3 ? numeric[1] : numeric[0] || "";
  const sizeH = numeric.length >= 3 ? numeric[2] : numeric[1] || "";
  const types = Array.isArray(cast.features)
    ? cast.features.map((feature: string) => ESTAMA_FEATURE_MAP[feature]).filter(Boolean).slice(0, 4)
    : [];
  const gallery = Array.isArray(cast.photos) ? cast.photos.filter(Boolean) : [];
  const photos = [cast.photo, ...gallery]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 6);
  const experience = String(cast.therapist_years ?? cast.therapist_experience ?? "")
    .match(/\d+/)?.[0] || "";

  return {
    name: cut(cast.name, 10),
    description: cut(cast.shop_comment, 500),
    cast_pr: cut(cast.therapist_comment || cast.profile || cast.message, 500),
    experience: experience.slice(0, 2),
    age: cut(cast.age, 2), tall: cut(cast.height, 3),
    size_b: sizeB.slice(0, 3), size_cup: sizeCup,
    size_w: sizeW.slice(0, 3), size_h: sizeH.slice(0, 3),
    blood: ["A", "B", "O", "AB"].includes(cast.blood_type) ? cast.blood_type : "",
    forte_procedure: cut(cast.favorite_techniques, 20),
    food: cut(cast.favorite_food, 20),
    man_like_type: cut(cast.ideal_type, 20),
    like_talent: cut(cast.celebrity_lookalike || cast.celebrity_like, 20),
    holiday: cut(cast.day_off_activities, 20),
    vogue: cut(cast.hobby || cast.hobbies, 20),
    // 外部ブログ欄＝O2のプロフィールURL、X(旧Twitter)欄＝SNS運用管理のXのプロフィールURL（server/estama-sns-links.ts）
    blog: cut(estamaBlogUrl(cast.o2_url, cast.blog_url), 255),
    twitter: cut(estamaXProfileUrl(cast.x_account), 255),
    instagram: cut(cast.instagram_url, 255),
    types, photos,
  };
}

