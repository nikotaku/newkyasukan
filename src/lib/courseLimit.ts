import { supabase } from "@/integrations/supabase/client";

// 新規のお客様のコースの上限（casts.new_customer_max_minutes、例：望月せなさんは80分まで）を超えた予約。
// 予約は止めず、WEB予約受付・予約表の予約詳細で知らせる。判定はDBの RPC get_course_limit_alerts（新規 = その電話番号で施術済みの予約がまだ無い）。

export interface CourseLimitAlert {
  reservation_id: string;
  cast_id: string;
  cast_name: string;
  max_minutes: number;
  duration: number;
}

export async function fetchCourseLimitAlerts(reservationIds: string[]) {
  const ids = [...new Set(reservationIds.filter(Boolean))];
  if (ids.length === 0) return new Map<string, CourseLimitAlert>();
  const { data, error } = await (supabase.rpc as unknown as (
    name: string, args: Record<string, unknown>,
  ) => Promise<{ data: CourseLimitAlert[] | null; error: { message: string } | null }>)(
    "get_course_limit_alerts", { p_reservation_ids: ids },
  );
  if (error) {
    console.warn("course limit alerts", error.message);
    return new Map<string, CourseLimitAlert>();
  }
  return new Map((data ?? []).map((row) => [row.reservation_id, row]));
}

export const courseLimitMessage = (alert: CourseLimitAlert) =>
  `${alert.cast_name}さんは新規のお客様は${alert.max_minutes}分まで（${alert.duration}分で予約されています）`;
