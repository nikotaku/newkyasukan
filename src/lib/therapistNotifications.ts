// セラピストへの予約通知（therapist_notifications）の表示用。
// 通知は予約の確定・変更・キャンセルでDBトリガーが積み、Edge Function notify-therapist が
// マイページ（ホーム画面に追加したアプリ）へプッシュ通知する。

import { supabase } from "@/integrations/supabase/client";

export type TherapistNotificationStatus = "queued" | "sending" | "sent" | "unreachable" | "failed" | "skipped";

export interface TherapistNotificationRow {
  id: string;
  cast_id: string;
  reservation_id: string | null;
  kind: "new" | "changed" | "cancelled" | "sns_ready" | "settlement";
  status: TherapistNotificationStatus;
  channel: "push" | "line" | null;
  source: "auto" | "manual";
  snapshot: { reason?: string | null } | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  acknowledged_at: string | null;
}

export const THERAPIST_NOTIFICATION_COLUMNS =
  "id,cast_id,reservation_id,kind,status,channel,source,snapshot,error_message,sent_at,created_at,acknowledged_at";

export function therapistNotificationKindLabel(row: Pick<TherapistNotificationRow, "kind" | "snapshot" | "source">) {
  if (row.kind === "sns_ready") return "SNSアカウントの準備完了";
  if (row.kind === "settlement") return "精算の承認";
  if (row.kind === "cancelled") return row.snapshot?.reason === "cast_changed" ? "担当変更" : "キャンセル";
  if (row.kind === "changed") return "予約の変更";
  return row.source === "manual" ? "再通知" : "新しい予約";
}

export function therapistNotificationStatusLabel(row: Pick<TherapistNotificationRow, "status" | "channel">) {
  switch (row.status) {
    case "queued":
    case "sending":
      return "送信中";
    case "sent":
      return row.channel === "line" ? "届けた（LINE）" : "届けた（マイページ）";
    case "unreachable":
      return "届け先なし";
    case "failed":
      return "送れなかった";
    default:
      return "送信不要";
  }
}

export function isTherapistNotificationProblem(row: Pick<TherapistNotificationRow, "status">) {
  return row.status === "unreachable" || row.status === "failed";
}

export async function loadReservationTherapistNotifications(reservationId: string, limit = 5) {
  const { data, error } = await supabase
    .from("therapist_notifications" as never)
    .select(THERAPIST_NOTIFICATION_COLUMNS)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TherapistNotificationRow[];
}

/** セラピストにもう一度知らせる（担当が決まっている確定済みの予約だけ） */
export async function resendTherapistNotification(reservationId: string) {
  const { data, error } = await supabase.rpc("resend_therapist_notification" as never, { p_reservation_id: reservationId } as never);
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export async function acknowledgeTherapistNotifications(ids: string[]) {
  const { data, error } = await supabase.rpc("acknowledge_therapist_notifications" as never, { p_ids: ids } as never);
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** セラピストのマイページのURL（ホーム画面に追加して通知をオンにしてもらう） */
export function therapistPortalUrl(customDomain: string | null | undefined, accessToken: string) {
  const base = customDomain
    ? `https://${customDomain}`
    : (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin);
  return `${base}/therapist/${encodeURIComponent(accessToken)}`;
}
