/**
 * セラピスト本人がマイページで入れるプロフィール（インタビュー）。
 * 本人の入力は提出（cast_profile_submissions）として残り、お店がスタッフ画面で確認して casts に反映する。
 * 項目は DB の public.therapist_profile_field_keys() とそろえる。
 */

export type TherapistProfileFieldKey =
  | "age"
  | "height"
  | "bust"
  | "waist"
  | "hip"
  | "cup_size"
  | "therapist_experience"
  | "favorite_techniques"
  | "favorite_food"
  | "ideal_type"
  | "celebrity_lookalike"
  | "day_off_activities"
  | "hobbies"
  | "therapist_comment";

export type TherapistProfileField = {
  key: TherapistProfileFieldKey;
  label: string;
  kind: "number" | "text" | "textarea";
  placeholder?: string;
  unit?: string;
};

export const THERAPIST_PROFILE_FIELDS: TherapistProfileField[] = [
  { key: "age", label: "年齢", kind: "number", placeholder: "24", unit: "歳" },
  { key: "height", label: "身長", kind: "number", placeholder: "158", unit: "cm" },
  { key: "bust", label: "バスト", kind: "number", placeholder: "84", unit: "cm" },
  { key: "waist", label: "ウエスト", kind: "number", placeholder: "58", unit: "cm" },
  { key: "hip", label: "ヒップ", kind: "number", placeholder: "84", unit: "cm" },
  { key: "cup_size", label: "カップ", kind: "text", placeholder: "D" },
  { key: "therapist_experience", label: "セラピスト歴", kind: "text", placeholder: "2年・未経験 など" },
  { key: "favorite_techniques", label: "得意な施術", kind: "text", placeholder: "リンパ・密着 など" },
  { key: "favorite_food", label: "好きな食べ物", kind: "text" },
  { key: "ideal_type", label: "好きな男性のタイプ", kind: "text" },
  { key: "celebrity_lookalike", label: "似ている芸能人", kind: "text" },
  { key: "day_off_activities", label: "休みの日は何してる？", kind: "text" },
  { key: "hobbies", label: "趣味・特技", kind: "text" },
  { key: "therapist_comment", label: "お客様へのひとこと", kind: "textarea", placeholder: "ご予約お待ちしています♡ など" },
];

export type TherapistProfileValues = Partial<Record<TherapistProfileFieldKey, string | number | null>>;

const NUMBER_KEYS = new Set(THERAPIST_PROFILE_FIELDS.filter((f) => f.kind === "number").map((f) => f.key));

const toNumber = (value: unknown): number | null => {
  const text = String(value ?? "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).trim();
  if (!text) return null;
  const n = Math.round(Number(text.replace(/[^\d.]/g, "")));
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
};

/** 送る前に整える：空は外し、数の欄は数に、文字は前後の空白を取る */
export function cleanProfileValues(values: TherapistProfileValues): TherapistProfileValues {
  const out: TherapistProfileValues = {};
  for (const field of THERAPIST_PROFILE_FIELDS) {
    const raw = values[field.key];
    if (NUMBER_KEYS.has(field.key)) {
      const n = toNumber(raw);
      if (n !== null) out[field.key] = n;
    } else {
      const text = String(raw ?? "").trim();
      if (text) out[field.key] = text.slice(0, 300);
    }
  }
  return out;
}

/** 提出の中身を casts に入れる形にする（同じ意味の古い列もそろえる） */
export function castPatchFromProfile(values: TherapistProfileValues): Record<string, string | number> {
  const clean = cleanProfileValues(values);
  const patch: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(clean)) {
    if (value === null || value === undefined) continue;
    patch[key] = value;
  }
  if (clean.cup_size) patch.bust_size = clean.cup_size;
  if (clean.therapist_comment) patch.profile = clean.therapist_comment;
  if (clean.bust && clean.waist && clean.hip) patch.body_size = `${clean.bust}/${clean.waist}/${clean.hip}`;
  return patch;
}

export type ProfileDiffRow = { key: TherapistProfileFieldKey; label: string; before: string; after: string };

/** いまの内容と提出を比べ、変わる項目だけ返す */
export function profileDiff(current: TherapistProfileValues, submitted: TherapistProfileValues): ProfileDiffRow[] {
  const clean = cleanProfileValues(submitted);
  return THERAPIST_PROFILE_FIELDS.flatMap((field) => {
    const after = clean[field.key];
    if (after === undefined || after === null) return [];
    const before = current[field.key];
    const beforeText = before === null || before === undefined ? "" : String(before).trim();
    const afterText = String(after);
    return beforeText === afterText ? [] : [{ key: field.key, label: field.label, before: beforeText, after: afterText }];
  });
}

/** スタッフ画面の Cast から、本人が入れる項目のいまの値を取り出す */
export function currentProfileValues(cast: Record<string, unknown>): TherapistProfileValues {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = cast[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value as string | number;
    }
    return null;
  };
  return {
    age: pick("age"),
    height: pick("height"),
    bust: pick("bust"),
    waist: pick("waist"),
    hip: pick("hip"),
    cup_size: pick("cup_size", "bust_size"),
    therapist_experience: pick("therapist_experience"),
    favorite_techniques: pick("favorite_techniques"),
    favorite_food: pick("favorite_food"),
    ideal_type: pick("ideal_type"),
    celebrity_lookalike: pick("celebrity_lookalike"),
    day_off_activities: pick("day_off_activities"),
    hobbies: pick("hobbies", "hobby"),
    therapist_comment: pick("therapist_comment", "profile"),
  };
}

/** 本人に送るプロフィール入力のURL */
export const therapistProfileFormUrl = (origin: string, token: string) => `${origin}/therapist/${token}?view=profile`;
