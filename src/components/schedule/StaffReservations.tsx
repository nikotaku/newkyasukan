import { useCallback, useEffect, useMemo, useState } from "react";
import { addMinutes, format, subDays } from "date-fns";
import { ja } from "date-fns/locale";
import { AlertCircle, CalendarDays, Inbox, Loader2, Phone, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PhoneCallLink } from "@/components/phone/PhoneCallLink";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toExtTime } from "@/lib/timeFormat";
import { cn } from "@/lib/utils";

// 予約一覧の「スタッフ受付」：予約表・電話などでスタッフが入れた予約（booking_origin = staff など）。
// WEBフォームのような対応状況は無いので、予約の状態（今後・未完了・完了・キャンセル）で分ける。
// 過ぎたのに「確定」のままの予約（未完了）は、ここで「完了」にできる（月別清算の「完了処理」の行き先）。

const STAFF_ORIGINS = ["staff", "legacy_unknown", "csv_import"];
const LOOKBACK_DAYS = 62;

type StaffFilter = "upcoming" | "overdue" | "completed" | "cancelled" | "all";

interface StaffReservation {
  id: string;
  cast_id: string | null;
  casts: { name: string } | { name: string }[] | null;
  course_name: string | null;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  duration: number;
  price: number | null;
  reservation_date: string;
  start_time: string;
  status: string;
  room: string | null;
}

const STATUS_OPTIONS: Record<string, { label: string; className: string }> = {
  confirmed: { label: "確定", className: "border-blue-200 bg-blue-50 text-blue-700" },
  hold: { label: "保留", className: "border-amber-200 bg-amber-50 text-amber-700" },
  pending: { label: "確認待ち", className: "border-slate-200 bg-slate-50 text-slate-700" },
  sms_waiting: { label: "SMS確認待ち", className: "border-violet-200 bg-violet-50 text-violet-700" },
  completed: { label: "完了", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  cancelled: { label: "キャンセル", className: "border-rose-200 bg-rose-50 text-rose-700" },
};
const CHOOSABLE = ["confirmed", "completed", "cancelled"];

const castName = (row: StaffReservation) =>
  (Array.isArray(row.casts) ? row.casts[0]?.name : row.casts?.name) ?? "未設定";

// DBは暦日＋24時間未満。朝6時前の予約は前日の営業日（24〜29時）として扱う
function businessDate(row: StaffReservation): string {
  const stored = new Date(`${row.reservation_date}T00:00:00`);
  if (Number.isNaN(stored.getTime())) return row.reservation_date;
  const shifted = toExtTime(row.start_time) !== row.start_time.slice(0, 5);
  return format(shifted ? subDays(stored, 1) : stored, "yyyy-MM-dd");
}

function endsAt(row: StaffReservation): Date {
  return addMinutes(new Date(`${row.reservation_date}T${row.start_time.slice(0, 8)}`), row.duration || 0);
}

function filterOf(row: StaffReservation, now: Date): Exclude<StaffFilter, "all"> {
  if (row.status === "completed") return "completed";
  if (row.status === "cancelled") return "cancelled";
  return endsAt(row) > now ? "upcoming" : "overdue";
}

const RECEIVED = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function StaffReservations({ storeId, active }: { storeId: string; active: boolean }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StaffReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StaffFilter>("upcoming");
  const [query, setQuery] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const fetchRows = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    const since = format(subDays(new Date(), LOOKBACK_DAYS), "yyyy-MM-dd");
    const { data, error: fetchError } = await supabase
      .from("reservations")
      .select("id, cast_id, casts(name), course_name, created_at, customer_name, customer_phone, duration, price, reservation_date, start_time, status, room")
      .eq("store_id", storeId)
      .in("booking_origin", STAFF_ORIGINS)
      .gte("reservation_date", since)
      .order("reservation_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(1000);
    if (fetchError) {
      console.error("Failed to fetch staff reservations", fetchError);
      setError("スタッフ受付の予約を読み込めませんでした。時間をおいて再度お試しください。");
    } else {
      setRows((data ?? []) as unknown as StaffReservation[]);
    }
    setNow(new Date());
    if (!background) setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (!active) return;
    void fetchRows();
    const channel = supabase
      .channel(`staff-reservations-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `store_id=eq.${storeId}` },
        () => void fetchRows(true))
      .subscribe();
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [active, fetchRows, storeId]);

  const counts = useMemo(() => {
    const next = { upcoming: 0, overdue: 0, completed: 0, cancelled: 0, all: rows.length };
    rows.forEach((row) => { next[filterOf(row, now)] += 1; });
    return next;
  }, [now, rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ja");
    const digits = query.replace(/\D/g, "");
    const list = rows.filter((row) => {
      if (filter !== "all" && filterOf(row, now) !== filter) return false;
      if (!q) return true;
      return row.customer_name.toLocaleLowerCase("ja").includes(q)
        || castName(row).toLocaleLowerCase("ja").includes(q)
        || (digits.length > 0 && row.customer_phone.replace(/\D/g, "").includes(digits));
    });
    // 今後の予約は近い順、それ以外は新しい順
    return filter === "upcoming" ? [...list].sort((a, b) => endsAt(a).getTime() - endsAt(b).getTime()) : list;
  }, [filter, now, query, rows]);

  const changeStatus = async (row: StaffReservation, status: string) => {
    if (status === row.status) return;
    if (status === "cancelled" && !window.confirm(`${row.customer_name}様の予約をキャンセルにしますか？（セラピストにも知らせます）`)) return;
    setUpdating(row.id);
    const { error: updateError } = await supabase.from("reservations").update({ status }).eq("id", row.id);
    setUpdating(null);
    if (updateError) {
      console.error(updateError);
      toast.error("予約の状態を変えられませんでした");
      return;
    }
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status } : item)));
    toast.success(`「${STATUS_OPTIONS[status]?.label ?? status}」にしました`);
  };

  const tabs: { value: StaffFilter; label: string }[] = [
    { value: "upcoming", label: "今後" },
    { value: "overdue", label: "未完了" },
    { value: "completed", label: "完了" },
    { value: "cancelled", label: "キャンセル" },
    { value: "all", label: "すべて" },
  ];

  return (
    <>
      <Card className="mb-5">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as StaffFilter)}>
            <TabsList className="grid h-auto w-full grid-cols-5 gap-1 p-1">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}
                  className="min-w-0 flex-col gap-0.5 px-1 py-1.5 text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
                  <span>{tab.label}</span>
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums sm:text-xs",
                    tab.value === "overdue" && counts.overdue > 0 ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground")}>
                    {counts[tab.value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9"
              placeholder="お客様名・電話番号・セラピストで検索" aria-label="お客様名・電話番号・セラピストで検索" />
          </div>
          <p className="text-xs text-muted-foreground">
            予約表・電話などでスタッフが入れた予約（直近{LOOKBACK_DAYS}日と今後）。「未完了」は時間が過ぎたのに確定のままの予約です。
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>読み込みエラー</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void fetchRows()}>再試行</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Card><CardContent className="grid min-h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">{query.trim() ? "検索条件に一致する予約はありません" : "該当する予約はありません"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const kind = filterOf(row, now);
            const status = STATUS_OPTIONS[row.status];
            const day = businessDate(row);
            return (
              <Card key={row.id} className={cn("overflow-hidden", kind === "overdue" && "border-rose-300")}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold">{row.customer_name} 様</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">受付 {RECEIVED.format(new Date(row.created_at))}</p>
                    </div>
                    <Select value={row.status} disabled={updating === row.id} onValueChange={(value) => void changeStatus(row, value)}>
                      <SelectTrigger aria-label={`${row.customer_name}様の予約の状態`}
                        className={cn("h-9 w-auto min-w-[104px] shrink-0 border font-semibold shadow-none", status?.className)}>
                        {updating === row.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([row.status, ...CHOOSABLE])].map((value) => (
                          <SelectItem key={value} value={value}>{STATUS_OPTIONS[value]?.label ?? value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {kind === "overdue" && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                      時間が過ぎていますが「確定」のままです。施術が終わっていれば「完了」にしてください。
                    </p>
                  )}
                  <PhoneCallLink phone={row.customer_phone} name={`${row.customer_name} 様`}
                    className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2.5 font-semibold text-primary">
                    <Phone className="h-4 w-4" />{row.customer_phone}
                  </PhoneCallLink>
                  <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 text-sm">
                    <span className="text-muted-foreground">予約日時</span>
                    <span className="font-medium">
                      {format(new Date(`${day}T00:00:00`), "yyyy/MM/dd（E）", { locale: ja })}<br />
                      {toExtTime(row.start_time)}（{row.duration}分）
                    </span>
                    <span className="text-muted-foreground">セラピスト</span>
                    <span>{castName(row)}</span>
                    <span className="text-muted-foreground">コース</span>
                    <span>{row.course_name || "—"}</span>
                    <span className="text-muted-foreground">料金</span>
                    <span className="font-semibold tabular-nums">¥{Number(row.price || 0).toLocaleString("ja-JP")}</span>
                    {row.room ? (<><span className="text-muted-foreground">ルーム</span><span>{row.room}</span></>) : null}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full"
                    onClick={() => navigate(`/admin-schedule?date=${day}`)}>
                    <CalendarDays className="mr-1.5 h-4 w-4" />予約表で開く（変更・詳細）
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
