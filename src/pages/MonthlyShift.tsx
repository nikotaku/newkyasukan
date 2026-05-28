import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, startOfWeek, addDays, isSameMonth, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import { Plus, ChevronLeft, ChevronRight, Trash2, LayoutGrid, Table2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Shift {
  id: string;
  cast_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  casts: { name: string };
}

interface Cast {
  id: string;
  name: string;
}

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

export default function MonthlyShift() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "matrix">("calendar");
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cast_id: "",
    shift_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "12:00",
    end_time: "21:00",
    room: "",
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMonthlyShifts();
      fetchCasts();
    }
  }, [user, selectedMonth]);

  const fetchMonthlyShifts = async () => {
    setLoading(true);
    const startDate = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
    const endDate = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("shifts")
      .select("*, casts(name)")
      .gte("shift_date", startDate)
      .lte("shift_date", endDate)
      .order("shift_date");
    if (error) console.error(error);
    setShifts((data || []) as Shift[]);
    setLoading(false);
  };

  const fetchCasts = async () => {
    const { data } = await supabase
      .from("casts")
      .select("id, name")
      .order("display_order", { ascending: true })
      .order("name");
    setCasts(data || []);
  };

  const handleSave = async () => {
    if (!form.cast_id) { toast.error("セラピストを選択してください"); return; }
    setSaving(true);
    const { error } = await supabase.from("shifts").insert([{
      cast_id: form.cast_id,
      shift_date: form.shift_date,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room || null,
    }]);
    setSaving(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    toast.success("シフトを追加しました");
    setShowDialog(false);
    fetchMonthlyShifts();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("shifts").delete().eq("id", id);
    setShifts(prev => prev.filter(s => s.id !== id));
  };

  const prevMonth = () => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));

  const days = eachDayOfInterval({ start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) });

  // セラピスト×日付マトリクス用: シフトがある人だけ表示
  const activeCastIds = [...new Set(shifts.map(s => s.cast_id))];
  const activeCasts = casts.filter(c => activeCastIds.includes(c.id));

  const shiftMap = new Map<string, Shift[]>(); // key: castId_date
  shifts.forEach(s => {
    const key = `${s.cast_id}_${s.shift_date}`;
    if (!shiftMap.has(key)) shiftMap.set(key, []);
    shiftMap.get(key)!.push(s);
  });

  // カレンダーグリッド用: 月初の週の日曜から始まる6週×7日
  const calendarStart = startOfWeek(startOfMonth(selectedMonth), { weekStartsOn: 0 });
  const calendarDays = Array.from({ length: 42 }, (_, i) => addDays(calendarStart, i));

  // 日付→その日の全シフト
  const dayShiftMap = new Map<string, Shift[]>();
  shifts.forEach(s => {
    if (!dayShiftMap.has(s.shift_date)) dayShiftMap.set(s.shift_date, []);
    dayShiftMap.get(s.shift_date)!.push(s);
  });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-2 md:p-6 overflow-x-auto">
        {/* ヘッダー */}
        <div className="mb-4 flex flex-wrap items-center gap-2 justify-between">
          {/* 左: タイトル + 月ナビ */}
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-bold">月別シフト</h1>
            <Button size="sm" variant="outline" onClick={prevMonth} className="h-7 w-7 p-0"><ChevronLeft size={15} /></Button>
            <span className="text-sm font-medium w-[76px] text-center">
              {format(selectedMonth, "yyyy年M月", { locale: ja })}
            </span>
            <Button size="sm" variant="outline" onClick={nextMonth} className="h-7 w-7 p-0"><ChevronRight size={15} /></Button>
          </div>
          {/* 右: ビュー切り替え + シフト追加 */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setViewMode("calendar")}
                className={cn("px-3 py-1.5 text-xs flex items-center gap-1", viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                <LayoutGrid size={13} />カレンダー
              </button>
              <button
                onClick={() => setViewMode("matrix")}
                className={cn("px-3 py-1.5 text-xs flex items-center gap-1 border-l", viewMode === "matrix" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                <Table2 size={13} />マトリクス
              </button>
            </div>
            <Button onClick={() => setShowDialog(true)} size="sm">
              <Plus size={14} className="mr-1" />シフト追加
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">読み込み中...</div>
        ) : (
          <>
            {/* ===== カレンダービュー ===== */}
            <div className={viewMode === "calendar" ? "" : "hidden"}>
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-7 border-b">
              {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "text-center text-xs font-semibold py-1.5",
                    i === 0 && "text-red-500",
                    i === 6 && "text-blue-500"
                  )}
                >
                  {d}
                </div>
              ))}
            </div>
            {/* 日付グリッド */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, selectedMonth);
                const today = isToday(day);
                const dow = getDay(day);
                const dayShifts = dayShiftMap.get(dateStr) || [];
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "min-h-[80px] md:min-h-[100px] border-r border-b p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                      !inMonth && "bg-muted/10",
                      dow === 0 && inMonth && "bg-red-50/30 dark:bg-red-950/10",
                      dow === 6 && inMonth && "bg-blue-50/30 dark:bg-blue-950/10"
                    )}
                    onClick={() => {
                      if (!inMonth) return;
                      setForm(f => ({ ...f, shift_date: dateStr }));
                      setShowDialog(true);
                    }}
                  >
                    <div className={cn(
                      "text-xs font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full",
                      today && "bg-primary text-primary-foreground",
                      !inMonth && "text-muted-foreground/40",
                      dow === 0 && inMonth && !today && "text-red-500",
                      dow === 6 && inMonth && !today && "text-blue-500"
                    )}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayShifts.slice(0, 4).map(s => (
                        <div
                          key={s.id}
                          className="group relative flex items-center gap-1 bg-primary/10 rounded px-1 py-0.5 text-[10px] leading-tight"
                          onClick={e => e.stopPropagation()}
                        >
                          <span className="font-medium text-primary truncate max-w-[50px] md:max-w-none">
                            {s.casts.name}
                          </span>
                          <span className="text-muted-foreground hidden md:inline shrink-0">
                            {s.start_time.slice(0,5)}〜
                          </span>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="absolute top-0 right-0 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] leading-none"
                          >×</button>
                        </div>
                      ))}
                      {dayShifts.length > 4 && (
                        <div className="text-[10px] text-muted-foreground pl-1">
                          +{dayShifts.length - 4}人
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

            {/* ===== マトリクスビュー ===== */}
            <div className={viewMode === "matrix" ? "" : "hidden"}>
              {activeCasts.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">この月のシフトはありません</div>
              ) : (
              <div className="overflow-x-auto rounded-lg border">
            <table className="text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/80 px-2 py-2 text-left font-semibold min-w-[80px] border-r border-border">
                    セラピスト
                  </th>
                  {days.map(day => {
                    const dow = getDay(day);
                    return (
                      <th
                        key={format(day, "yyyy-MM-dd")}
                        className={cn(
                          "px-1 py-1 text-center font-medium border-r border-border min-w-[52px] whitespace-nowrap",
                          dow === 0 && "text-red-500",
                          dow === 6 && "text-blue-500"
                        )}
                      >
                        <div>{format(day, "d")}</div>
                        <div className="text-muted-foreground font-normal">{WEEKDAY[dow]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {activeCasts.map(cast => (
                  <tr key={cast.id} className="border-t border-border hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-background border-r border-border px-2 py-1 font-medium whitespace-nowrap">
                      {cast.name}
                    </td>
                    {days.map(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const cell = shiftMap.get(`${cast.id}_${dateStr}`) || [];
                      const dow = getDay(day);
                      return (
                        <td
                          key={dateStr}
                          className={cn(
                            "border-r border-border px-1 py-1 align-top cursor-pointer hover:bg-primary/5",
                            dow === 0 && "bg-red-50/40 dark:bg-red-950/10",
                            dow === 6 && "bg-blue-50/40 dark:bg-blue-950/10"
                          )}
                          onClick={() => {
                            setForm(f => ({ ...f, cast_id: cast.id, shift_date: dateStr }));
                            setShowDialog(true);
                          }}
                        >
                          {cell.map(s => (
                            <div key={s.id} className="group relative bg-primary/10 rounded px-1 py-0.5 mb-0.5">
                              <div className="font-semibold text-primary leading-tight">
                                {s.start_time.slice(0, 5)}
                              </div>
                              <div className="text-muted-foreground leading-tight">
                                ~{s.end_time.slice(0, 5)}
                              </div>
                              {s.room && (
                                <div className="text-[10px] text-primary/70 truncate max-w-[48px]">{s.room}</div>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                                className="absolute top-0 right-0 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[10px]"
                              >×</button>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
              )}
            </div>
          </>
        )}
      </main>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>シフト入力</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>セラピスト</Label>
              <Select value={form.cast_id} onValueChange={v => setForm({ ...form, cast_id: v })}>
                <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  {casts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>日付</Label>
              <Input type="date" value={form.shift_date} onChange={e => setForm({ ...form, shift_date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>開始時間</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>終了時間</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>ルーム（任意）</Label>
              <Input value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} placeholder="例：インroom" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>キャンセル</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
