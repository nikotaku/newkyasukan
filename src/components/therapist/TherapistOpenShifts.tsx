import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  buildShiftBoard,
  datesBetween,
  formatMinutes,
  shiftPeriodLabel,
  shiftPeriodRange,
  type BoardShift,
  type DayBoard,
} from "@/lib/shiftOpenSlots";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 期間のルームと出勤を読んで、日ごとの空きにする */
export async function fetchShiftBoard(token: string, start: string, end: string): Promise<DayBoard[]> {
  const { data, error } = await supabase.rpc("get_therapist_shift_board" as never, { p_token: token, p_from: start, p_to: end } as never);
  if (error) throw error;
  const board = (data ?? {}) as { rooms?: string[]; shifts?: BoardShift[] };
  return buildShiftBoard(datesBetween(start, end), board.rooms ?? [], board.shifts ?? []);
}

const weekdayColor = (date: string) => {
  const dow = new Date(`${date}T00:00:00+09:00`).getDay();
  return dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "";
};

export const dayLabel = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[new Date(`${date}T00:00:00+09:00`).getDay()]})`;
};

/** マイページ「空きシフト」：期間のルームごとの空いている時間。出られる日は「追加提出する」から出す */
export function TherapistOpenShifts({ token, start, end, onChangePeriod }: {
  token: string;
  start: string;
  end: string;
  onChangePeriod: (start: string, end: string) => void;
}) {
  const navigate = useNavigate();
  const [days, setDays] = useState<DayBoard[] | null>(null);
  const label = shiftPeriodLabel(start, end);

  useEffect(() => {
    setDays(null);
    fetchShiftBoard(token, start, end)
      .then(setDays)
      .catch((error) => { toast.error(error instanceof Error ? error.message : "読み込めませんでした"); setDays([]); });
  }, [token, start, end]);

  // 前後の半月へ
  const shift = (direction: -1 | 1) => {
    const [y, m, d] = start.split("-").map(Number);
    const firstHalf = d <= 15;
    let month = new Date(Date.UTC(y, m - 1, 1));
    let half: "first" | "second";
    if (direction === 1) {
      if (firstHalf) half = "second";
      else { month = new Date(Date.UTC(y, m, 1)); half = "first"; }
    } else if (firstHalf) { month = new Date(Date.UTC(y, m - 2, 1)); half = "second"; }
    else half = "first";
    const range = shiftPeriodRange(`${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`, half);
    onChangePeriod(range.start, range.end);
  };

  const openDays = useMemo(() => (days ?? []).filter((day) => day.open.length > 0).length, [days]);

  return (
    <div className="space-y-3">
      <Card><CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => shift(-1)}><ChevronLeft size={16} />前</Button>
          <p className="font-bold">{label}の空きシフト</p>
          <Button variant="ghost" size="sm" onClick={() => shift(1)}>次<ChevronRight size={16} /></Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ルームごとに、まだ誰も入っていない時間（3時間以上）です。出られる日があれば「追加提出する」から出してください。お店が確定するとシフト確認に出ます。
        </p>
        <Button className="w-full" onClick={() => navigate(`/therapist/${token}/shift?from=${start}&to=${end}`)}>
          <CalendarPlus size={16} className="mr-1" />追加提出する
        </Button>
      </CardContent></Card>

      {days === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <p className="px-1 text-xs text-muted-foreground">空きのある日 {openDays}/{days.length}日</p>
          <div className="space-y-1.5">
            {days.map((day) => (
              <div key={day.date} className={`rounded-lg border px-3 py-2 ${day.open.length ? "bg-card" : "bg-muted/40"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-16 shrink-0 text-sm font-semibold ${weekdayColor(day.date)}`}>
                    {dayLabel(day.date)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {day.mine.map((mine, i) => (
                      <span key={`m${i}`} className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        あなた {mine.start.slice(0, 5)}〜{mine.end.slice(0, 5)}{mine.approval === "approved" ? "" : "（申請中）"}
                      </span>
                    ))}
                    {day.open.length === 0 ? (
                      <span className="text-xs text-muted-foreground">空きなし</span>
                    ) : day.open.map((slot, i) => (
                      <span key={i} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {slot.room} {formatMinutes(slot.start)}〜{formatMinutes(slot.end)}
                      </span>
                    ))}
                  </div>
                </div>
                {day.pendingWithoutRoom > 0 && day.open.length > 0 && (
                  <p className="mt-0.5 pl-[72px] text-[10px] text-muted-foreground">ほかに申請中 {day.pendingWithoutRoom}人（ルーム未定）</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
