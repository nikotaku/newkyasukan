import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// エステ魂の仮予約メールを直接取り込み、HPの出勤を基にダミー宛て・出勤なしなどを判定して出す。
// 「予約表に登録」で予約入力が開き、内容が入った状態で確認して保存する（自動では確定しない）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
type ResponseStatus = "unhandled" | "in_progress" | "handled";
type ResponseFilter = ResponseStatus | "all";
const RESPONSE_STATUS: Record<
  ResponseStatus,
  { label: string; className: string }
> = {
  unhandled: {
    label: "未対応",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  in_progress: {
    label: "対応中",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  handled: {
    label: "対応済み",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

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
  const [responseFilter, setResponseFilter] =
    useState<ResponseFilter>("unhandled");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    // 昨日以降の希望日のもの（過ぎたものは出さない）
    const since = new Date(Date.now() - 30 * 3600_000)
      .toISOString()
      .slice(0, 10);
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

  const setStatus = async (
    row: EstamaReservationRequest,
    status: "new" | "dismissed",
  ) => {
    setBusy(row.id);
    const { error } = await (
      supabase.rpc as unknown as (
        n: string,
        a: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>
    )("set_estama_reservation_request", { p_id: row.id, p_status: status });
    setBusy(null);
    if (error) toast.error(error.message);
    else void load();
  };

  const setResponseStatus = async (
    row: EstamaReservationRequest,
    status: ResponseStatus,
  ) => {
    if (row.response_status === status) return true;
    setBusy(row.id);
    const { error } = await (
      supabase.rpc as unknown as (
        n: string,
        a: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>
    )("update_estama_response_status", {
      p_id: row.id,
      p_store_id: storeId,
      p_status: status,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await load();
    return true;
  };

  const openSchedule = async (row: EstamaReservationRequest) => {
    const updated = await setResponseStatus(row, "in_progress");
    if (updated) navigate(scheduleUrlForRequest(row.id));
  };

  const sorted = useMemo(() => sortRequests(rows), [rows]);
  const counts = useMemo(() => {
    const next = {
      all: sorted.length,
      unhandled: 0,
      in_progress: 0,
      handled: 0,
    };
    sorted.forEach((row) => {
      next[row.response_status] += 1;
    });
    return next;
  }, [sorted]);
  const visible = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ja");
    const phone = searchQuery.replace(/\D/g, "");
    return sorted.filter((row) => {
      if (responseFilter !== "all" && row.response_status !== responseFilter)
        return false;
      if (!query) return true;
      return (
        (row.customer_name ?? "").toLocaleLowerCase("ja").includes(query) ||
        (phone.length > 0 &&
          (row.customer_phone ?? "").replace(/\D/g, "").includes(phone))
      );
    });
  }, [responseFilter, searchQuery, sorted]);
  const responseTabs: {
    value: ResponseFilter;
    label: string;
    count: number;
  }[] = [
    { value: "unhandled", label: "未対応", count: counts.unhandled },
    { value: "in_progress", label: "対応中", count: counts.in_progress },
    { value: "handled", label: "対応済み", count: counts.handled },
    { value: "all", label: "すべて", count: counts.all },
  ];

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              エステ魂からの仮予約
              {counts.unhandled > 0 && (
                <span className="rounded-full bg-rose-500 px-2 text-xs text-white">
                  {counts.unhandled}
                </span>
              )}
            </h2>
          </div>
        </div>


        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <Tabs
            value={responseFilter}
            onValueChange={(value) =>
              setResponseFilter(value as ResponseFilter)
            }
          >
            <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
              {responseTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="min-w-0 gap-1 px-1 py-2 text-xs sm:text-sm"
                >
                  <span>{tab.label}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {tab.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="お客様名・電話番号で検索"
              className="pl-9"
            />
          </div>
        </div>

        {loading && !rows.length ? (
          <div className="py-6 text-center">
            <Loader2 size={18} className="mx-auto animate-spin text-primary" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            該当する仮予約はありません
          </p>
        ) : (
          <div className="grid gap-2">
            {visible.map((row) => {
              const check = CHECK_LABEL[row.check_status] ?? CHECK_LABEL.ok;
              const finished = row.response_status === "handled";
              const response = RESPONSE_STATUS[row.response_status];
              return (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-lg border p-3 text-sm space-y-1.5",
                    finished && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {whenLabel(row.hope_date, row.hope_time)}〜{" "}
                        {row.course_minutes ? `${row.course_minutes}分` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        指名：{row.nomination_label ?? "—"} /{" "}
                        {row.customer_name
                          ? `${row.customer_name}様`
                          : "お客様"}{" "}
                        {row.customer_phone}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          toneClass[check.tone],
                        )}
                      >
                        {check.tone === "danger" && (
                          <AlertTriangle size={11} className="mr-0.5 inline" />
                        )}
                        {check.label}
                      </span>
                      <Select
                        value={row.response_status}
                        disabled={busy === row.id || row.status !== "new"}
                        onValueChange={(value) =>
                          void setResponseStatus(row, value as ResponseStatus)
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            "h-7 w-[104px] text-xs font-semibold",
                            response.className,
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.entries(RESPONSE_STATUS) as [
                              ResponseStatus,
                              (typeof RESPONSE_STATUS)[ResponseStatus],
                            ][]
                          ).map(([value, item]) => (
                            <SelectItem key={value} value={value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {row.response_status === "in_progress" &&
                      row.response_status_updated_at ? (
                        <span className="max-w-[150px] text-right text-[10px] leading-tight text-amber-700">
                          対応開始{" "}
                          {new Intl.DateTimeFormat("ja-JP", {
                            timeZone: "Asia/Tokyo",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(row.response_status_updated_at))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {row.check_note && (
                    <p
                      className={cn(
                        "text-xs",
                        check.tone === "danger"
                          ? "text-red-700 dark:text-red-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.check_note}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[
                      row.course_label,
                      row.option_label ? `オプション：${row.option_label}` : "",
                      row.total_price
                        ? `合計 ${row.total_price.toLocaleString("ja-JP")}円（クーポン前）`
                        : "",
                      row.coupon ? `クーポン：${row.coupon.slice(0, 40)}` : "",
                      row.visit_kind,
                    ]
                      .filter(Boolean)
                      .join(" ／ ")}
                  </p>
                  {row.request_note && (
                    <p className="text-xs">ご要望：{row.request_note}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {row.status === "new" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy === row.id}
                          onClick={() => void openSchedule(row)}
                        >
                          <CalendarPlus size={14} className="mr-1" />
                          予約表に登録
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === row.id}
                          onClick={() => void setStatus(row, "dismissed")}
                        >
                          {busy === row.id ? (
                            <Loader2 size={14} className="mr-1 animate-spin" />
                          ) : (
                            <XCircle size={14} className="mr-1" />
                          )}
                          対応不要
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 size={13} />
                          {row.status === "registered"
                            ? "予約表に登録済み"
                            : "対応不要にしました"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={busy === row.id}
                          onClick={() => void setStatus(row, "new")}
                        >
                          <RotateCcw size={13} className="mr-1" />
                          未対応に戻す
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
