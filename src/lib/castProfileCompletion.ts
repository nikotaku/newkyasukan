/**
 * セラピストのプロフィールがどこまで入っているか（スタッフ画面のカードに％で出す）。
 * 源氏名が決まる前は name が「源氏名未定」（DBトリガー trg_casts_pending_stage_name）。
 */

export const PENDING_STAGE_NAME = "源氏名未定";

export function isStageNamePending(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  return trimmed === "" || trimmed === PENDING_STAGE_NAME || trimmed === "名称未設定";
}

/** カードや一覧に出す名前。源氏名が未定なら本名（スタッフ画面だけで使う） */
export function castAdminLabel(cast: { name: string | null; real_name?: string | null }): string {
  if (!isStageNamePending(cast.name)) return (cast.name ?? "").trim();
  const real = (cast.real_name ?? "").trim();
  return real ? `${real}（源氏名未定）` : PENDING_STAGE_NAME;
}

export type CastProfileFields = {
  name: string | null;
  real_name?: string | null;
  photo?: string | null;
  age?: number | null;
  height?: number | null;
  bust?: number | null;
  waist?: number | null;
  hip?: number | null;
  body_size?: string | null;
  cup_size?: string | null;
  bust_size?: string | null;
  therapist_experience?: string | null;
  therapist_years?: number | null;
  favorite_techniques?: string | null;
  favorite_food?: string | null;
  ideal_type?: string | null;
  celebrity_lookalike?: string | null;
  day_off_activities?: string | null;
  hobbies?: string | null;
  hobby?: string | null;
  therapist_comment?: string | null;
  profile?: string | null;
  shop_comment?: string | null;
};

const filled = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

export const CAST_PROFILE_ITEMS: { key: string; label: string; done: (cast: CastProfileFields) => boolean }[] = [
  { key: "name", label: "源氏名", done: (c) => !isStageNamePending(c.name) },
  { key: "real_name", label: "本名", done: (c) => filled(c.real_name) },
  { key: "photo", label: "写真", done: (c) => filled(c.photo) },
  { key: "age", label: "年齢", done: (c) => filled(c.age) },
  { key: "height", label: "身長", done: (c) => filled(c.height) },
  { key: "three_size", label: "スリーサイズ", done: (c) => (filled(c.bust) && filled(c.waist) && filled(c.hip)) || filled(c.body_size) },
  { key: "cup", label: "カップ", done: (c) => filled(c.cup_size) || filled(c.bust_size) },
  { key: "experience", label: "セラピスト歴", done: (c) => filled(c.therapist_experience) || filled(c.therapist_years) },
  { key: "favorite_techniques", label: "得意な施術", done: (c) => filled(c.favorite_techniques) },
  { key: "favorite_food", label: "好きな食べ物", done: (c) => filled(c.favorite_food) },
  { key: "ideal_type", label: "好きな男性のタイプ", done: (c) => filled(c.ideal_type) },
  { key: "celebrity_lookalike", label: "似ている芸能人", done: (c) => filled(c.celebrity_lookalike) },
  { key: "day_off_activities", label: "休みの日", done: (c) => filled(c.day_off_activities) },
  { key: "hobbies", label: "趣味・特技", done: (c) => filled(c.hobbies) || filled(c.hobby) },
  { key: "therapist_comment", label: "セラピストコメント", done: (c) => filled(c.therapist_comment) || filled(c.profile) },
  { key: "shop_comment", label: "お店からのコメント", done: (c) => filled(c.shop_comment) },
];

export type CastProfileCompletion = {
  percent: number;
  done: number;
  total: number;
  missing: string[];
};

export function castProfileCompletion(cast: CastProfileFields): CastProfileCompletion {
  const missing = CAST_PROFILE_ITEMS.filter((item) => !item.done(cast)).map((item) => item.label);
  const total = CAST_PROFILE_ITEMS.length;
  const done = total - missing.length;
  return { percent: Math.round((done / total) * 100), done, total, missing };
}
