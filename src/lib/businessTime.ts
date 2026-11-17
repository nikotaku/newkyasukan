// ※ Edge Function（send-sms・push-notify・sms-webhook）からも相対パスで読む。デプロイ時は一緒に送る
// 予約の日時を営業日（朝6時切り替え）で表す。お客様・セラピスト・管理画面の通知で表記をそろえる。
// DBには暦日＋24時間未満の時刻で入っている（11/17 24:00 → 11/18 00:00）ので、6時前は前日の24〜29時に戻す。
// 例: ("2026-11-18", "00:00") → 11/17(火) 24:00、("2026-11-18", "01:30") → 11/17(火) 25:30

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export interface BusinessDateTime {
  /** 営業日（YYYY-MM-DD） */
  date: string;
  month: number;
  day: number;
  weekday: string;
  /** 24時間を超える表記の開始時刻（例: "24:00"） */
  time: string;
}

export function businessDateTime(reservationDate: string | null | undefined, startTime: string | null | undefined): BusinessDateTime | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(reservationDate ?? "");
  if (!dateMatch) return null;
  const clock = /^(\d{1,2}):(\d{2})/.exec(startTime ?? "");
  const hour = clock ? Number(clock[1]) : null;
  const minute = clock ? Number(clock[2]) : 0;
  const date = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
  const late = hour !== null && hour < 6;
  if (late) date.setUTCDate(date.getUTCDate() - 1);
  return {
    date: date.toISOString().slice(0, 10),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: WEEKDAYS[date.getUTCDay()],
    time: hour === null ? "" : `${String(late ? hour + 24 : hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/** 11/17(火) */
export function businessDateShort(value: BusinessDateTime | null) {
  return value ? `${value.month}/${value.day}(${value.weekday})` : "";
}

/** 11月17日(火) */
export function businessDateLong(value: BusinessDateTime | null) {
  return value ? `${value.month}月${value.day}日(${value.weekday})` : "";
}
