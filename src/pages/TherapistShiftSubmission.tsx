import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { ja } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

interface ShiftEntry {
  start: string;
  end: string;
}

const WEEK_DAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function TherapistShiftSubmission() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selections, setSelections] = useState<Record<string, ShiftEntry>>({}); // dateStr -> {start, end}

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_cast_by_access_token", { p_token: token });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          toast.error("無効なアクセスリンクです");
          navigate("/");
          return;
        }
        setCast(row as Cast);
      } catch (e) {
        console.error(e);
        toast.error("読み込みに失敗しました");
        navigate("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, navigate]);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDay = getDay(startOfMonth(currentMonth));

  const toggleDay = (dateStr: string) => {
    setSelections(prev => {
      if (prev[dateStr]) {
        const { [dateStr]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [dateStr]: { start: "12:00", end: "21:00" } };
    });
  };

  const updateTime = (dateStr: string, field: "start" | "end", value: string) => {
    setSelections(prev => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!token) return;
    const shifts = Object.entries(selections).map(([date, entry]) => ({
      shift_date: date,
      start_time: entry.start,
      end_time: entry.end,
    }));
    if (shifts.length === 0) {
      toast.error("シフトを選択してください");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_therapist_shifts", {
        p_token: token,
        p_shifts: shifts as any,
      });
      if (error) throw error;
      toast.success(`${data ?? shifts.length}件のシフトを提出しました`);
      setSelections({});
    } catch (e: any) {
      console.error(e);
      toast.error(e.message === "invalid_token" ? "アクセストークンが無効です" : "提出に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cast) return null;

  const selectedCount = Object.keys(selections).length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/therapist/${token}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />戻る
          </Button>
          {cast.photo && <img src={cast.photo} alt={cast.name} className="h-10 w-10 rounded-full object-cover" />}
          <div>
            <h1 className="text-lg font-bold">{cast.name}様</h1>
            <p className="text-xs text-muted-foreground">シフト提出</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}>
                <ChevronLeft className="h-4 w-4" />前月
              </Button>
              <CardTitle className="text-base">{format(currentMonth, "yyyy年M月", { locale: ja })}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                次月<ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">日付をタップして出勤日を追加。時間は自由に変更できます。</p>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEK_DAYS.map((d, i) => (
                <div key={d} className={`text-center text-xs font-semibold py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`pad-${i}`} />)}
              {days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd");
                const entry = selections[dateStr];
                const dow = day.getDay();
                return (
                  <div
                    key={dateStr}
                    className={`border rounded-md p-1 min-h-[60px] flex flex-col transition-colors ${entry ? "bg-primary/10 border-primary/40" : "hover:bg-muted/40 cursor-pointer"} ${dow === 0 ? "border-red-200" : dow === 6 ? "border-blue-200" : ""}`}
                    onClick={() => !entry && toggleDay(dateStr)}
                  >
                    <div className={`text-xs font-bold mb-1 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""}`}>
                      {format(day, "d")}
                    </div>
                    {entry ? (
                      <div className="space-y-0.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="time"
                          value={entry.start}
                          onChange={e => updateTime(dateStr, "start", e.target.value)}
                          className="w-full text-[11px] border rounded px-0.5 py-0.5 text-center"
                        />
                        <input
                          type="time"
                          value={entry.end}
                          onChange={e => updateTime(dateStr, "end", e.target.value)}
                          className="w-full text-[11px] border rounded px-0.5 py-0.5 text-center"
                        />
                        <button
                          onClick={() => toggleDay(dateStr)}
                          className="w-full text-[10px] text-rose-500 hover:text-rose-700 text-center leading-tight"
                        >✕ 取消</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-sm p-3">
        <div className="container mx-auto max-w-3xl flex items-center justify-between gap-3">
          <Badge variant="secondary">選択中: {selectedCount}日</Badge>
          <Button onClick={handleSubmit} disabled={submitting || selectedCount === 0}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            シフトを提出
          </Button>
        </div>
      </div>
    </div>
  );
}
