// セラピストのマイページ：その月の本数（施術済み・予定）。月を切り替えて過去の月も見られる。
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  businessMonth,
  monthLabel,
  normalizeMonthlyCounts,
  shiftMonth,
  totalCount,
  type MonthlyCountRow,
  type TherapistMonthlyCounts,
} from "@/lib/therapistMonthlyCount";

const OLDEST_MONTHS_BACK = 24;

function useTherapistMonthlyCounts(token: string | undefined, month: string) {
  const [data, setData] = useState<TherapistMonthlyCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc("get_therapist_monthly_counts" as never, {
      p_token: token,
      p_month: `${month}-01`,
    } as never);
    setLoading(false);
    if (error) {
      console.error("本数を読めませんでした", error);
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(normalizeMonthlyCounts(result, month));
  }, [token, month]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  return { data, loading, failed, reload };
}

function CountText({ row }: { row: MonthlyCountRow }) {
  return (
    <span className="tabular-nums">
      <span className="font-bold">{row.done}</span>本
      {row.scheduled > 0 && <span className="ml-1 text-muted-foreground">＋予定{row.scheduled}</span>}
    </span>
  );
}

export function TherapistMonthlyCount({ token }: { token: string }) {
  const currentMonth = businessMonth(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [showDays, setShowDays] = useState(false);
  const { data, loading, failed } = useTherapistMonthlyCounts(token, month);
  const isCurrent = month === currentMonth;
  const oldest = shiftMonth(currentMonth, -OLDEST_MONTHS_BACK);
  const label = monthLabel(month, currentMonth);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-muted/30 px-2 py-2">
        <button
          type="button"
          aria-label="前の月"
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={month <= oldest}
          onClick={() => { setMonth((value) => shiftMonth(value, -1)); setShowDays(false); }}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-1.5">
          <BarChart3 size={15} className="text-primary" />
          <span className="text-sm font-semibold">{label}の本数</span>
        </div>
        <button
          type="button"
          aria-label="次の月"
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={isCurrent}
          onClick={() => { setMonth((value) => shiftMonth(value, 1)); setShowDays(false); }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading && !data ? (
        <div className="py-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-primary" /></div>
      ) : failed && !data ? (
        <p className="py-5 text-center text-xs text-muted-foreground">本数を読み込めませんでした。時間をおいて開き直してください</p>
      ) : data ? (
        <div className="px-4 py-3">
          <div className="flex items-end justify-center gap-1">
            <span className="text-4xl font-bold leading-none tabular-nums text-primary">{data.done}</span>
            <span className="pb-0.5 text-sm font-semibold">本</span>
          </div>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {data.scheduled > 0
              ? <>施術済み・このほか予定 <span className="font-bold text-foreground">{data.scheduled}本</span>（合計 {totalCount(data)}本）</>
              : isCurrent ? "施術済み（キャンセルは数えません）" : "施術した本数"}
          </p>

          {totalCount(data) > 0 && (
            <div className="mt-3 space-y-2">
              {data.nominations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.nominations.map((row) => (
                    <span key={row.label} className="rounded-full border bg-background px-2.5 py-1 text-xs">
                      {row.label} <CountText row={row} />
                    </span>
                  ))}
                </div>
              )}
              {data.durations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.durations.map((row) => (
                    <span key={row.minutes} className="rounded-full bg-muted/60 px-2.5 py-1 text-xs">
                      {row.minutes}分 <CountText row={row} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {data.days.length > 0 && (
            <>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-semibold text-primary"
                onClick={() => setShowDays((value) => !value)}
              >
                日ごとの本数{showDays ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showDays && (
                <div className="mt-2 divide-y rounded-lg border">
                  {data.days.map((day) => (
                    <div key={day.date} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {format(new Date(`${day.date}T00:00:00`), "M/d(E)", { locale: ja })}
                      </span>
                      <CountText row={day} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {totalCount(data) === 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{label}の予約はまだありません</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
