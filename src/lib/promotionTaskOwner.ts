export type PromotionTaskOwner = "store" | "therapist";

const STORE_CHANNELS = new Set([
  "hp_top_banner",
  "estama_top_banner",
  "hp_news",
  "estama_news",
  "line_official",
]);
const PERSONAL_CHANNELS = new Set(["x_post", "o2_post", "o2_story"]);

/**
 * 同じルールをDBの private.is_therapist_promotion_task にも適用する。
 * 本人が投稿にバナー素材を使う場合は除外しない。担当の判定は本文ではなく見出しを使う。
 * 担当が不明な作業は店舗側に残し、ポータルで誤って完了できないようにする。
 */
export function promotionTaskOwner(
  taskType: string | null | undefined,
  label: string | null | undefined,
  channelKey: string | null | undefined,
): PromotionTaskOwner {
  if (taskType !== "posting" || STORE_CHANNELS.has(channelKey ?? "")) return "store";
  const prefix = (label ?? "").replace(/：/g, ":").split(":")[0].trim();
  if (/店舗|お店|公式アカウント/.test(prefix)) return "store";
  if (/バナー|ニュース|LINE|ＬＩＮＥ/i.test(prefix)) return "store";
  if (PERSONAL_CHANNELS.has(channelKey ?? "")) return "therapist";
  if (/^(本人|セラピスト|個人)?(の)?\s*[XＸ](投稿|[\s（(]|$)/.test(prefix) ||
      /^(本人|セラピスト|個人)?(の)?\s*(0|０|O|Ｏ)2/.test(prefix)) return "therapist";
  return "store";
}
