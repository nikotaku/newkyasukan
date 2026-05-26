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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { ja } from "date-fns/locale";
import { Plus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Shift {
  id: string;
  cast_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  status: string;
  casts: { name: string };
}

interface Cast {
  id: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
}

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

export default function MonthlyShift() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reservationCounts, setReservationCounts] = useState<Record<string, number>>({});
  const [casts, setCasts] = useState<Cast[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"matrix" | "calendar">("matrix");
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
      fetchRooms();
    }
  }, [user, selectedMonth]);

  const fetchMonthlyShifts = async () => {
    setLoading(true);
    const startDate = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
    const endDate = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
    const [{ data, error }, { data: rData }] = await Promise.all([
      supabase
        .from("shifts")
        .select("*, casts(name)")
        .gte("shift_date", startDate)
        .lte("shift_date", endDate)
        .order("shift_date"),
      supabase
        .from("reservations")
        .select("reservation_date")
        .gte("reservation_date", startDate)
        .lte("reservation_date", endDate)
        .neq("status", "cancelled"),
    ]);
    if (error) console.error(error);
    setShifts((data || []) as Shift[]);
    const counts: Record<string, number> = {};
    (rData || []).forEach((r: any) => {
      counts[r.reservation_date] = (counts[r.reservation_date] ?? 0) + 1;
    });
    setReservationCounts(counts);
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

  const fetchRooms = async () => {
    const { data } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setRooms(data || []);
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

  const handleToggleApproval = async (s: Shift) => {
    const next = (s.status === "approved" || s.status === "scheduled") ? "pending" : "approved";
    const { error } = await supabase.from("shifts").update({ status: next }).eq("id", s.id);
    if (error) { toast.error("ステータス更新に失敗しました"); return; }
    setShifts(prev => prev.map(x => x.id === s.id ? { ...x, status: next } : x));
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-2 md:p-6">
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">月別シフト</h1>
            <Button onClick={() => setShowDialog(true)} size="sm">
              <Plus size={14} className="mr-1" />シフト追加
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={prevMonth}><ChevronLeft size={16} /></Button>
              <span className="text-sm font-medium min-w-[80px] text-center">
                {format(selectedMonth, "yyyy年M月", { locale: ja })}
              </span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={nextMonth}><ChevronRight size={16} /></Button>
            </div>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setViewMode("matrix")}
                className={cn("px-2 py-1 text-xs", viewMode === "matrix" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
              >マトリクス</button>
              <button
                onClick={() => setViewMode("calendar")}
                className={cn("px-2 py-1 text-xs", viewMode === "calendar" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
              >カレンダー</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">読み込み中...</div>
        ) : viewMode === "calendar" ? (
          /* カレンダービュー */
          <div className="overflow-x-auto">
          <div className="rounded-lg border bg-card min-w-[560px]">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAY.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "text-center text-xs font-semibold py-2 border-r border-border last:border-r-0",
                    i === 0 && "text-red-500",
                    i === 6 && "text-blue-500"
                  )}
                >{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: getDay(startOfMonth(selectedMonth)) }).map((_, i) => (
                <div key={`pad-${i}`} className="border-r border-b border-border min-h-[110px] bg-muted/10" />
              ))}
              {days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayShifts = shifts.filter(s => s.shift_date === dateStr);
                const resCount = reservationCounts[dateStr] ?? 0;
                const dow = getDay(day);
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "border-r border-b border-border last:border-r-0 min-h-[110px] p-1 align-top cursor-pointer hover:bg-primary/5 transition-colors",
                      dow === 0 && "bg-red-50/40",
                      dow === 6 && "bg-blue-50/40"
                    )}
                    onClick={() => {
                      setForm(f => ({ ...f, shift_date: dateStr }));
                      setShowDialog(true);
                    }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={cn(
                        "text-xs font-semibold",
                        dow === 0 && "text-red-500",
                        dow === 6 && "text-blue-500"
                      )}>{format(day, "d")}</span>
                      {resCount > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-medium">
                          予約{resCount}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayShifts.map(s => {
                        const approved = s.status === "approved" || s.status === "scheduled";
                        return (
                          <div
                            key={s.id}
                            className={cn(
                              "group relative text-[10px] rounded px-1 py-0.5 leading-tight",
                              approved ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800 border border-amber-300"
                            )}
                          >
                            <div
                              onClick={e => { e.stopPropagation(); handleToggleApproval(s); }}
                              className="cursor-pointer hover:opacity-70"
                              title={approved ? "クリックで未承認に戻す" : "クリックで承認"}
                            >
                              <div className="font-semibold truncate pr-3">{s.casts?.name}</div>
                              <div className="text-[9px] text-muted-foreground">
                                {s.start_time.slice(0, 5)}~{s.end_time.slice(0, 5)}
                              </div>
                              {s.room && <div className="text-[9px] truncate">{s.room}</div>}
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                              className="absolute top-0 right-0 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] leading-none"
                            >×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        ) : activeCasts.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">この月のシフトはありません</div>
        ) : (
          /* セラピスト×日付マトリクス */
          <div className="overflow-x-auto rounded-lg border">
            <table className="text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/80 px-2 py-2 text-left font-semibold min-w-[80px] border-r border-border">
                    セラピスト
                  </th>
                  {days.map(day => {
                    const dow = getDay(day);
                    const dateStr = format(day, "yyyy-MM-dd");
                    const resCount = reservationCounts[dateStr] ?? 0;
                    return (
                      <th
                        key={dateStr}
                        className={cn(
                          "px-1 py-1 text-center font-medium border-r border-border min-w-[52px] whitespace-nowrap",
                          dow === 0 && "text-red-500",
                          dow === 6 && "text-blue-500"
                        )}
                      >
                        <div>{format(day, "d")}</div>
                        <div className="text-muted-foreground font-normal">{WEEKDAY[dow]}</div>
                        {resCount > 0 && (
                          <div className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-medium mt-0.5">
                            予{resCount}
                          </div>
                        )}
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
                          {cell.map(s => {
                            const approved = s.status === "approved" || s.status === "scheduled";
                            return (
                              <div
                                key={s.id}
                                className={cn(
                                  "group relative rounded px-1 py-0.5 mb-0.5",
                                  approved ? "bg-primary/10" : "bg-amber-100/70 border border-amber-300"
                                )}
                              >
                                <div className={cn("font-semibold leading-tight", approved ? "text-primary" : "text-amber-800")}>
                                  {s.start_time.slice(0, 5)}
                                </div>
                                <div className="text-muted-foreground leading-tight">
                                  ~{s.end_time.slice(0, 5)}
                                </div>
                                {s.room && (
                                  <div className="text-[10px] text-primary/70 truncate max-w-[48px]">{s.room}</div>
                                )}
                                <button
                                  onClick={e => { e.stopPropagation(); handleToggleApproval(s); }}
                                  className={cn(
                                    "block w-full text-[10px] mt-0.5 rounded leading-tight",
                                    approved ? "text-green-700 hover:bg-green-100" : "text-amber-700 hover:bg-amber-200"
                                  )}
                                  title={approved ? "クリックで未承認に戻す" : "クリックで承認"}
                                >
                                  {approved ? "✓承認済" : "未承認"}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                                  className="absolute top-0 right-0 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-[10px]"
                                >×</button>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              <Select value={form.room || "__none__"} onValueChange={v => setForm({ ...form, room: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="選択してください（任意）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">指定なし</SelectItem>
                  {rooms.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
