import { useCallback, useEffect, useState } from "react";
import { BellOff, Check, Copy, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toExtTime } from "@/lib/timeFormat";
import {
  THERAPIST_NOTIFICATION_COLUMNS,
  acknowledgeTherapistNotifications,
  therapistNotificationKindLabel,
  therapistPortalUrl,
  type TherapistNotificationRow,
} from "@/lib/therapistNotifications";

// セラピストへの予約通知が届かなかったとき（マイページの通知が未設定・送信失敗）に、管理画面の左下で知らせる。
// 共通のLINEグループには送らないので、ここを見て直接連絡し、「連絡した」で消す。

type Row = TherapistNotificationRow & {
  snapshot: { reason?: string | null; reservation_date?: string | null; start_time?: string | null } | null;
  casts: { name: string } | null;
  reservations: { reservation_date: string; start_time: string; customer_name: string } | null;
};

const POLL_MS = 30_000;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function whenLabel(row: Row) {
  const date = row.reservations?.reservation_date ?? row.snapshot?.reservation_date;
  const start = row.reservations?.start_time ?? row.snapshot?.start_time;
  if (!date || !start) return "";
  const [year, month, day] = date.split("-").map(Number);
  const business = new Date(year, month - 1, day);
  if (Number(start.slice(0, 2)) < 6) business.setDate(business.getDate() - 1);
  return `${business.getMonth() + 1}/${business.getDate()} ${toExtTime(start)}〜`;
}

export function TherapistNotifyAlert() {
  const { store } = useAdminStore();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!store?.id) return;
    const { data, error } = await supabase
      .from("therapist_notifications" as never)
      .select(`${THERAPIST_NOTIFICATION_COLUMNS},casts(name),reservations(reservation_date,start_time,customer_name)`)
      .eq("store_id", store.id)
      .in("status", ["unreachable", "failed"])
      .is("acknowledged_at", null)
      .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setRows((data ?? []) as unknown as Row[]);
  }, [store?.id]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const visible = rows.filter((row) => !hidden.has(row.id));
  if (!store?.id || !visible.length) return null;

  const acknowledge = async () => {
    setBusy(true);
    try {
      await acknowledgeTherapistNotifications(visible.map((row) => row.id));
      setRows([]);
    } catch (error) {
      toast({ title: "できませんでした", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(false);
      load();
    }
  };

  const copyPortalUrl = async (castId: string, castName: string) => {
    try {
      const { data, error } = await supabase.rpc("get_cast_access_tokens");
      if (error) throw error;
      const token = (data ?? []).find((row: { cast_id: string; access_token: string }) => row.cast_id === castId)?.access_token;
      if (!token) throw new Error("マイページが未発行です。セラピストDBからアクセスリンクを発行してください");
      await navigator.clipboard.writeText(therapistPortalUrl(store.custom_domain, token));
      toast({ title: `${castName}さんのマイページのURLをコピーしました`, description: "送って、ホーム画面に追加→「通知をオンにする」をお願いしてください" });
    } catch (error) {
      toast({ title: "コピーできませんでした", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  return (
    <div role="alert" className="w-full rounded-xl border border-rose-400/70 bg-card p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <BellOff size={16} className="mt-0.5 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">セラピストに通知が届いていません</p>
          <p className="mt-0.5 text-xs text-muted-foreground">直接連絡してから「連絡した」を押してください</p>
          <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {visible.map((row) => {
              const castName = row.casts?.name ?? "セラピスト";
              return (
                <li key={row.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <b>{castName}</b>さん {whenLabel(row)} {therapistNotificationKindLabel(row)}
                    </span>
                    {row.status === "unreachable" && (
                      <button
                        type="button"
                        onClick={() => copyPortalUrl(row.cast_id, castName)}
                        className="shrink-0 inline-flex items-center gap-0.5 text-primary hover:underline"
                        title="マイページのURLをコピー（通知の設定をお願いする）"
                      >
                        <Copy size={11} />URL
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-rose-600">
                    {row.status === "unreachable" ? "マイページの通知が未設定" : row.error_message || "送信に失敗しました"}
                  </div>
                </li>
              );
            })}
          </ul>
          <Button size="sm" className="mt-2 h-8" onClick={acknowledge} disabled={busy}>
            {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
            連絡した
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setHidden(new Set([...hidden, ...visible.map((row) => row.id)]))}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="あとで"
          title="あとで（画面を開き直すとまた出ます）"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
