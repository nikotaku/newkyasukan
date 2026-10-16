import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarPlus, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  CHECK_LABEL,
  ESTAMA_REQUEST_COLUMNS,
  scheduleUrlForRequest,
  sortRequests,
  type EstamaReservationRequest,
} from "@/lib/estamaReservationRequests";

// エステ魂の仮予約（管理画面「お店への予約」を5分ごとに自動で読み取り）。HPの出勤が正しい前提で、ダミー宛て・出勤なしなどを判定して出す。
// 「予約表に登録」で予約入力が開き、内容が入った状態で確認して保存する（自動では確定しない）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const toneClass = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

function whenLabel(date: string, time: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${time.slice(0, 5)}`;
}

export function EstamaReservationRequests() {
  const { storeId } = useAdminStore();
  const navigate = useNavigate();
  const [rows, setRows] = useState<EstamaReservationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    // 昨日以降の希望日のもの（過ぎたものは出さない）
    const since = new Date(Date.now() - 30 * 3600_000).toISOString().slice(0, 10);
    const { data, error } = await untyped("estama_reservation_requests")
      .select(ESTAMA_REQUEST_COLUMNS)
      .eq("store_id", storeId)
      .gte("hope_date", since)
      .order("hope_date", { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as EstamaReservationRequest[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const setStatus = async (row: EstamaReservationRequest, status: "new" | "dismissed") => {
    setBusy(row.id);
    const { error } = await (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
      "set_estama_reservation_request", { p_id: row.id, p_status: status },
    );
    setBusy(null);
    if (error) toast.error(error.message);
    else void load();
  };

  const sorted = useMemo(() => sortRequests(rows), [rows]);
  const open = sorted.filter((row) => row.status === "new");
  const done = sorted.filter((row) => row.status !== "new");
  const visible = showDone ? sorted : open;


  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              エステ魂からの仮予約
              {open.length > 0 && <span className="rounded-full bg-rose-500 px-2 text-xs text-white">{open.length}</span>}
            </h2>
            <p className="text-xs text-muted-foreground">
              エステ魂の「お店への予約」を5分ごとに自動で読み取っています。HPの出勤で判定し、ダミー宛て・出勤なしは赤で出します。予約表に同じお客様・同じ時間の予約があれば自動で「登録済み」になります。
            </p>
          </div>
          {done.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "未対応だけ" : `対応済みも見る（${done.length}）`}
            </Button>
          )}
        </div>

        {loading && !rows.length ? (
          <div className="py-6 text-center"><Loader2 size={18} className="mx-auto animate-spin text-primary" /></div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">未対応の仮予約はありません</p>
        ) : (
          <div className="grid gap-2">
            {visible.map((row) => {
              const check = CHECK_LABEL[row.check_status] ?? CHECK_LABEL.ok;
              const finished = row.status !== "new";
              return (
                <div key={row.id} className={cn("rounded-lg border p-3 text-sm space-y-1.5", finished && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{whenLabel(row.hope_date, row.hope_time)}〜 {row.course_minutes ? `${row.course_minutes}分` : ""}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        指名：{row.nomination_label ?? "—"} / {row.customer_name ? `${row.customer_name}様` : "お客様"} {row.customer_phone}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", toneClass[check.tone])}>
                      {check.tone === "danger" && <AlertTriangle size={11} className="mr-0.5 inline" />}
                      {check.label}
                    </span>
                  </div>
                  {row.check_note && <p className={cn("text-xs", check.tone === "danger" ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>{row.check_note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {[row.course_label, row.option_label ? `オプション：${row.option_label}` : "", row.total_price ? `合計 ${row.total_price.toLocaleString("ja-JP")}円（クーポン前）` : "", row.coupon ? `クーポン：${row.coupon.slice(0, 40)}` : "", row.visit_kind]
                      .filter(Boolean).join(" ／ ")}
                  </p>
                  {row.request_note && <p className="text-xs">ご要望：{row.request_note}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {row.status === "new" ? (
                      <>
                        <Button size="sm" onClick={() => navigate(scheduleUrlForRequest(row.id))}>
                          <CalendarPlus size={14} className="mr-1" />予約表に登録
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void setStatus(row, "dismissed")}>
                          {busy === row.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <XCircle size={14} className="mr-1" />}対応不要
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 size={13} />{row.status === "registered" ? "予約表に登録済み" : "対応不要にしました"}
                        </span>
                        <Button size="sm" variant="ghost" className="h-7" disabled={busy === row.id} onClick={() => void setStatus(row, "new")}>
                          <RotateCcw size={13} className="mr-1" />未対応に戻す
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
