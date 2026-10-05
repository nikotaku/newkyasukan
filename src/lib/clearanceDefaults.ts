// 日別精算の雑費・宿泊費の自動入力。
// 雑費は1本（予約1件）あたり1,000円で、1日2,000円まで（給与画面の雑費と同じ決まり）。
// 出稼ぎのセラピスト（casts.tags に「出稼ぎ」）は宿泊費が1日2,000円。
// 自動で入れるのは、その日の精算をまだ保存していないときだけ（保存済みの金額・手で直した金額はそのまま）。

export const MISC_FEE_PER_SESSION = 1_000;
export const MISC_FEE_DAILY_CAP = 2_000;
export const DEKASEGI_ACCOMMODATION_PER_DAY = 2_000;
export const DEKASEGI_TAG = "出稼ぎ";

/** その日の本数から雑費を出す（1本1,000円・1日2,000円まで） */
export function defaultMiscExpenses(sessionCount: number) {
  const sessions = Number.isFinite(sessionCount) ? Math.max(0, Math.floor(sessionCount)) : 0;
  return Math.min(sessions * MISC_FEE_PER_SESSION, MISC_FEE_DAILY_CAP);
}

export function isDekasegiTherapist(tags: readonly string[] | null | undefined) {
  return Array.isArray(tags) && tags.some((tag) => tag?.trim() === DEKASEGI_TAG);
}

/** 出稼ぎのセラピストは1日2,000円、それ以外は0円 */
export function defaultAccommodationFee(tags: readonly string[] | null | undefined) {
  return isDekasegiTherapist(tags) ? DEKASEGI_ACCOMMODATION_PER_DAY : 0;
}

/** 画面に出す「自動入力」の説明 */
export function miscExpensesHint(sessionCount: number) {
  const amount = defaultMiscExpenses(sessionCount);
  const capped = sessionCount * MISC_FEE_PER_SESSION > MISC_FEE_DAILY_CAP;
  return `自動：${sessionCount}本×¥1,000${capped ? "（1日¥2,000まで）" : ""}＝¥${amount.toLocaleString("ja-JP")}`;
}
