import { useCallback, useEffect, useState } from "react";
import { BellRing, Copy, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { countSmsSegments, JP_SMS_UNIT_PRICE_YEN } from "@/lib/smsSegments";
import {
  isTherapistNotificationProblem,
  loadReservationTherapistNotifications,
  resendTherapistNotification,
  therapistNotificationKindLabel,
  therapistNotificationStatusLabel,
  type TherapistNotificationRow,
} from "@/lib/therapistNotifications";

// 予約表の「再送」。お客様への予約確認SMS（Twilio）と、セラピストへの予約通知（マイページのプッシュ通知）は
// どちらも予約が確定したときに自動で送られる。届いていない・もう一度送りたいときだけここから送り直す。

export interface ResendReservation {
  id: string;
  status: string;
  cast_id: string | null;
  customer_name: string;
  customer_phone: string;
  sms_notification_status?: string | null;
  sms_notification_sent_at?: string | null;
}

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

async function functionError(error: unknown) {
  const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
  return detail?.error || (error instanceof Error ? error.message : String(error));
}

export function ReservationResendDialog({
  reservation,
  castName,
  portalUrl,
  onOpenChange,
  onChanged,
}: {
  reservation: ResendReservation | null;
  castName: string;
  /** セラピストのマイページのURL（未発行なら null） */
  portalUrl: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<TherapistNotificationRow[] | null>(null);
  const [busy, setBusy] = useState<"sms" | "therapist" | null>(null);
  const [smsResult, setSmsResult] = useState<"sent" | "failed" | null>(null);

  const reservationId = reservation?.id ?? null;
  const canNotifyTherapist = reservation?.status === "confirmed" && Boolean(reservation?.cast_id);

  const loadNotifications = useCallback(async () => {
    if (!reservationId) return;
    try {
      setNotifications(await loadReservationTherapistNotifications(reservationId));
    } catch {
      setNotifications([]);
    }
  }, [reservationId]);

  useEffect(() => {
    if (!reservationId) return;
    setPreview(null);
    setPreviewError(null);
    setSmsResult(null);
    setNotifications(null);
    loadNotifications();
    supabase.functions
      .invoke("send-sms", { body: { reservation_id: reservationId, preview_only: true } })
      .then(async ({ data, error }) => {
        if (error) setPreviewError(await functionError(error));
        else setPreview((data as { preview?: string })?.preview ?? "");
      });
  }, [reservationId, loadNotifications]);

  // 再通知のあと、送り終わるまで少しのあいだ状態を読み直す
  useEffect(() => {
    if (!reservationId || !notifications?.some((row) => row.status === "queued" || row.status === "sending")) return;
    const timer = window.setTimeout(loadNotifications, 3000);
    return () => window.clearTimeout(timer);
  }, [reservationId, notifications, loadNotifications]);

  if (!reservation) return null;

  const segments = preview ? countSmsSegments(preview).segments : 0;
  const smsStatus = smsResult ?? reservation.sms_notification_status ?? null;

  const resendSms = async () => {
    setBusy("sms");
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", { body: { reservation_id: reservation.id } });
      if (error) throw new Error(await functionError(error));
      if (!(data as { ok?: boolean })?.ok) throw new Error("送信できませんでした");
      setSmsResult("sent");
      toast({ title: "お客様にSMSを再送しました" });
      onChanged?.();
    } catch (error) {
      setSmsResult("failed");
      toast({ title: "SMSを送れませんでした", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const resendTherapist = async () => {
    setBusy("therapist");
    try {
      await resendTherapistNotification(reservation.id);
      toast({ title: `${castName}さんに再通知しています`, description: "数秒で結果がここに出ます" });
      await loadNotifications();
    } catch (error) {
      toast({ title: "再通知できませんでした", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copyPortalUrl = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast({ title: "マイページのURLをコピーしました", description: "セラピストに送って、ホーム画面に追加→「通知をオンにする」をお願いしてください" });
    } catch {
      toast({ title: "コピーできませんでした", variant: "destructive" });
    }
  };

  const latest = notifications?.[0] ?? null;
  const unreachable = latest?.status === "unreachable";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RefreshCw size={18} />再送</DialogTitle>
          <DialogDescription>
            予約が確定したときに自動で送っています。届いていない・もう一度送りたいときだけ使ってください。
          </DialogDescription>
        </DialogHeader>

        {/* お客様への予約確認SMS */}
        <section className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare size={15} />お客様への予約確認SMS</p>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                smsStatus === "sent" && "border-emerald-300 text-emerald-700",
                smsStatus === "failed" && "border-rose-300 text-rose-700",
              )}
            >
              {smsStatus === "sent" ? `送信済み ${smsResult ? "" : formatDateTime(reservation.sms_notification_sent_at)}`.trim()
                : smsStatus === "failed" ? "送信失敗"
                : "未送信"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{reservation.customer_name} 様（{reservation.customer_phone || "電話番号なし"}）</p>
          {previewError ? (
            <p className="text-xs text-destructive">{previewError}</p>
          ) : preview === null ? (
            <div className="py-3 text-center"><Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" /></div>
          ) : (
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[11px] leading-relaxed font-sans">{preview}</pre>
          )}
          <Button
            className="w-full"
            variant={smsStatus === "sent" ? "outline" : "default"}
            onClick={resendSms}
            disabled={busy !== null || !reservation.customer_phone || Boolean(previewError) || preview === null}
          >
            {busy === "sms" ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <MessageSquare size={15} className="mr-1.5" />}
            お客様にSMSを再送
            {segments > 0 && <span className="ml-1 text-xs opacity-75">（{segments}通分・約{Math.round(segments * JP_SMS_UNIT_PRICE_YEN)}円）</span>}
          </Button>
        </section>

        {/* セラピストへの予約通知 */}
        <section className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-semibold flex items-center gap-1.5"><BellRing size={15} />{castName || "セラピスト"}さんへの予約通知</p>
          {notifications === null ? (
            <div className="py-2 text-center"><Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" /></div>
          ) : notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground">まだ通知の記録がありません。</p>
          ) : (
            <ul className="space-y-1">
              {notifications.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{formatDateTime(row.created_at)} {therapistNotificationKindLabel(row)}</span>
                  <span className={cn(
                    "text-right",
                    row.status === "sent" && "text-emerald-700",
                    isTherapistNotificationProblem(row) && "text-rose-700 font-medium",
                  )}>
                    {therapistNotificationStatusLabel(row)}
                    {isTherapistNotificationProblem(row) && row.error_message && (
                      <span className="block font-normal text-[10px]">{row.error_message}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {unreachable && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 space-y-1.5">
              <p>マイページのスマホ通知が未設定です。直接連絡したうえで、マイページのURLを送って設定をお願いしてください。</p>
              {portalUrl && (
                <Button size="sm" variant="outline" className="h-7 bg-white" onClick={copyPortalUrl}>
                  <Copy size={13} className="mr-1" />マイページのURLをコピー
                </Button>
              )}
            </div>
          )}
          <Button
            className="w-full"
            variant={latest?.status === "sent" ? "outline" : "default"}
            onClick={resendTherapist}
            disabled={busy !== null || !canNotifyTherapist}
          >
            {busy === "therapist" ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <BellRing size={15} className="mr-1.5" />}
            セラピストに再通知
          </Button>
          {!canNotifyTherapist && (
            <p className="text-[11px] text-muted-foreground">担当セラピストが決まっている確定済みの予約だけ再通知できます。</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
