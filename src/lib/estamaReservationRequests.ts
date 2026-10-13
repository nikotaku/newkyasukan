// エステ魂の仮予約（estama_reservation_requests）の画面用：判定の表示・予約入力への引き継ぎ。
// テスト: npm run test:estama-reserve（tests/estamaReservationRequests.test.ts）

export type EstamaCheckStatus = "ok" | "dummy" | "unknown_cast" | "no_shift" | "outside_shift" | "overlap" | "free" | "course_limit";

export interface EstamaReservationRequest {
  id: string;
  received_at: string | null;
  hope_date: string;
  hope_time: string;
  nomination_label: string | null;
  is_free: boolean;
  cast_name: string | null;
  cast_id: string | null;
  course_label: string | null;
  course_minutes: number | null;
  course_price: number | null;
  nomination_fee: number | null;
  total_price: number | null;
  coupon: string | null;
  request_note: string | null;
  visit_kind: string | null;
  member_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  check_status: EstamaCheckStatus;
  check_note: string | null;
  status: "new" | "registered" | "dismissed";
  reservation_id: string | null;
}

export const ESTAMA_REQUEST_COLUMNS =
  "id,received_at,hope_date,hope_time,nomination_label,is_free,cast_name,cast_id,course_label,course_minutes,course_price,nomination_fee,total_price,coupon,request_note,visit_kind,member_label,customer_name,customer_phone,customer_email,check_status,check_note,status,reservation_id";

export const CHECK_LABEL: Record<EstamaCheckStatus, { label: string; tone: "ok" | "warn" | "danger" | "info" }> = {
  ok: { label: "出勤OK", tone: "ok" },
  free: { label: "フリー", tone: "info" },
  overlap: { label: "予約が重なる", tone: "warn" },
  course_limit: { label: "新規のコース上限超え", tone: "danger" },
  outside_shift: { label: "出勤の時間外", tone: "warn" },
  no_shift: { label: "HPに出勤なし", tone: "danger" },
  dummy: { label: "ダミー宛て", tone: "danger" },
  unknown_cast: { label: "HPにいない名前", tone: "danger" },
};

/** 予約表（/admin-schedule）で新規予約を開き、この仮予約の内容を入れるURL */
export const ESTAMA_REQUEST_PARAM = "estama";
export const scheduleUrlForRequest = (id: string) => `/admin-schedule?${ESTAMA_REQUEST_PARAM}=${id}`;

export function requestIdFromSearch(search: string) {
  const value = new URLSearchParams(search).get(ESTAMA_REQUEST_PARAM);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/**
 * 予約入力に渡す値。深夜（0〜6時）は予約表と同じく前の日の「25:00」のように営業日で表す。
 * 指名がダミー・HPにいない名前ならセラピストは空（出勤している子を選んでもらう）。
 */
export function prefillFromRequest(request: EstamaReservationRequest) {
  const [h, m] = request.hope_time.slice(0, 5).split(":").map(Number);
  const late = h < 6;
  const date = new Date(`${request.hope_date}T00:00:00`);
  if (late) date.setDate(date.getDate() - 1);
  const startTime = `${String(late ? h + 24 : h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const useCast = request.cast_id && !["dummy", "unknown_cast"].includes(request.check_status);
  const notes = [
    "【エステ魂の仮予約】",
    `指名：${request.nomination_label ?? (request.is_free ? "フリー" : "")}`,
    request.course_label ? `コース：${request.course_label}${request.course_minutes ? `（${request.course_minutes}分）` : ""}${request.course_price ? ` ${request.course_price.toLocaleString("ja-JP")}円` : ""}` : "",
    request.nomination_fee ? `指名料：${request.nomination_fee.toLocaleString("ja-JP")}円` : "",
    request.total_price ? `合計（クーポン前）：${request.total_price.toLocaleString("ja-JP")}円` : "",
    request.coupon ? `クーポン：${request.coupon}` : "",
    request.request_note ? `ご要望：${request.request_note}` : "",
    [request.visit_kind, request.member_label].filter(Boolean).join("・"),
  ].filter(Boolean).join("\n");
  return {
    cast_id: useCast ? request.cast_id! : "",
    customer_name: request.customer_name ?? "",
    customer_phone: request.customer_phone ?? "",
    customer_email: request.customer_email ?? "",
    reservation_date: date,
    start_time: startTime,
    duration: request.course_minutes ?? undefined,
    nomination_type: request.is_free ? "none" : undefined,
    notes,
  };
}

/** まだ対応していない・これからの仮予約を先に（希望日時の早い順） */
export function sortRequests<T extends Pick<EstamaReservationRequest, "status" | "hope_date" | "hope_time">>(requests: T[]) {
  const rank = (status: string) => (status === "new" ? 0 : 1);
  return [...requests].sort((a, b) =>
    rank(a.status) - rank(b.status)
    || (rank(a.status) === 0
      ? `${a.hope_date}${a.hope_time}`.localeCompare(`${b.hope_date}${b.hope_time}`)
      : `${b.hope_date}${b.hope_time}`.localeCompare(`${a.hope_date}${a.hope_time}`)));
}
