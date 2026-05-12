import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ja } from "date-fns/locale";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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

export default function MonthlyShift() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
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
    try {
      const startDate = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
      const endDate = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("shifts")
        .select("*, casts(name)")
        .gte("shift_date", startDate)
        .lte("shift_date", endDate)
        .order("shift_date", { ascending: true });
      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error("Error fetching shifts:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCasts = async () => {
    try {
      const { data, error } = await supabase
        .from("casts")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setCasts(data || []);
    } catch (error) {
      console.error("Error fetching casts:", error);
    }
  };

  const handleSave = async () => {
    if (!form.cast_id) {
      toast.error("セラピストを選択してください");
      return;
    }
    if (!form.shift_date) {
      toast.error("日付を入力してください");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("shifts").insert([{
        cast_id: form.cast_id,
        shift_date: form.shift_date,
        start_time: form.start_time,
        end_time: form.end_time,
        room: form.room || null,
      }]);
      if (error) throw error;
      toast.success("シフトを追加しました");
      setShowDialog(false);
      fetchMonthlyShifts();
    } catch (error) {
      console.error("Error saving shift:", error);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const prevMonth = () => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));

  const days = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth),
  });

  const shiftsMap = new Map<string, Shift[]>();
  shifts.forEach((shift) => {
    const key = shift.shift_date;
    if (!shiftsMap.has(key)) shiftsMap.set(key, []);
    shiftsMap.get(key)!.push(shift);
  });

  const firstDayOfWeek = startOfMonth(selectedMonth).getDay();

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-2 md:p-6">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold">月別シフト</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Button size="sm" variant="ghost" onClick={prevMonth}>
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="text-muted-foreground text-sm font-medium min-w-[100px] text-center">
                    {format(selectedMonth, "yyyy年M月", { locale: ja })}
                  </span>
                  <Button size="sm" variant="ghost" onClick={nextMonth}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={() => setShowDialog(true)}>
              <Plus size={16} className="mr-2" />
              シフト入力
            </Button>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : (
            <div className="grid grid-cols-7 gap-0.5 md:gap-2">
              {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                <div key={day} className="text-center font-semibold py-1 text-xs md:text-sm">
                  {day}
                </div>
              ))}

              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayShifts = shiftsMap.get(dateStr) || [];

                return (
                  <Card
                    key={dateStr}
                    className="min-h-[70px] md:min-h-[100px] p-1 md:p-2 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => {
                      setForm((f) => ({ ...f, shift_date: dateStr }));
                      setShowDialog(true);
                    }}
                  >
                    <div className="text-xs font-semibold mb-1">
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayShifts.map((shift) => (
                        <div key={shift.id} className="text-xs bg-primary/10 p-1 rounded truncate">
                          <div className="font-semibold">{shift.casts.name}</div>
                          <div className="text-muted-foreground">
                            {shift.start_time.slice(0, 5)}～{shift.end_time.slice(0, 5)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>シフト入力</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>セラピスト</Label>
              <Select value={form.cast_id} onValueChange={(v) => setForm({ ...form, cast_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {casts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>日付</Label>
              <Input
                type="date"
                value={form.shift_date}
                onChange={(e) => setForm({ ...form, shift_date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>開始時間</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div>
                <Label>終了時間</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>ルーム（任意）</Label>
              <Input
                value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="例：インroom"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>
                キャンセル
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
