/**
 * 深夜またぎシフト対応の時刻表示。
 * 06:00 未満の時刻は翌日扱い（24時間超）として表示する。
 * 例: "00:10" → "24:10"、"01:30" → "25:30"、"13:00" → "13:00"
 */
export const toExtTime = (timeStr: string): string => {
  const s = timeStr.slice(0, 5);
  const [h, m] = s.split(":").map(Number);
  if (h < 6) return `${24 + h}:${String(m).padStart(2, "0")}`;
  return s;
};
