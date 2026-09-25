export type EstamaShiftAction = "upsert" | "delete";

export const estamaIndividualShiftAdminUrl = (externalId: string | null | undefined) => {
  const normalized = typeof externalId === "string" ? externalId.trim() : "";
  return normalized
    ? `https://estama.jp/admin/schedule/${encodeURIComponent(normalized)}/`
    : null;
};

export const estamaScheduleEndTime = (startTime: string, endTime: string) => {
  const startHour = Number(startTime.slice(0, 2));
  const endHour = Number(endTime.slice(0, 2));
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || endHour > startHour) {
    return endTime.slice(0, 5);
  }
  const overnightHour = Math.min(endHour + 24, 25);
  return `${String(overnightHour).padStart(2, "0")}:${endTime.slice(3, 5)}`;
};

// エステ魂の個別出勤設定画面は、登録できる日（当日から2週間分）だけ
// column[YYYY-MM-DD][select][select_start] を持つ。画面にある日付を正として判定する。
const scheduleStartFieldName = /^column\[(\d{4}-\d{2}-\d{2})\]\[select\]\[select_start\]$/;

export const estamaScheduleDatesFromFieldNames = (names: string[]) =>
  [...new Set(names
    .map((name) => name.match(scheduleStartFieldName)?.[1] || "")
    .filter(Boolean))]
    .sort();

export type EstamaScheduleDateState =
  | { state: "ready" }
  | { state: "outside_range"; firstDate: string; lastDate: string }
  | { state: "no_schedule" };

export const classifyEstamaScheduleDate = (
  availableDates: string[],
  shiftDate: string,
): EstamaScheduleDateState => {
  const dates = [...availableDates].sort();
  if (!dates.length) return { state: "no_schedule" };
  if (dates.includes(shiftDate)) return { state: "ready" };
  return { state: "outside_range", firstDate: dates[0], lastDate: dates[dates.length - 1] };
};

export const estamaOutsideRangeMessage = (firstDate: string, lastDate: string) =>
  `エステ魂の出勤登録期間（${firstDate}〜${lastDate}）外のため保留しました。期間内に入ると毎日23時の自動同期で登録します`;

export const estamaNotListedMessage = (castName: string) =>
  `エステ魂に「${castName}」が掲載されていません（公開ページなし・管理画面に出勤表なし）。`
  + "エステ魂で再掲載するか、セラピストのエステ魂連携を見直してください";

export const estamaScheduleExpectation = (
  action: EstamaShiftAction,
  startTime: string,
  endTime: string,
) => action === "delete"
  ? { start: "", end: "" }
  : {
    start: startTime.slice(0, 5),
    end: estamaScheduleEndTime(startTime, endTime),
  };
