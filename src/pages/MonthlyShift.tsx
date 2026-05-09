import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ja } from "date-fns/locale";

interface Shift {
  id: string;
  cast_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  casts: { name: string };
}

export default function MonthlyShift() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMonthlyShifts();
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">月別シフト</h1>
            <p className="text-muted-foreground">
              {format(selectedMonth, "yyyy年M月", { locale: ja })}
            </p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                <div
                  key={day}
                  className="text-center font-semibold p-2 text-sm"
                >
                  {day}
                </div>
              ))}

              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayShifts = shiftsMap.get(dateStr) || [];
                const isCurrentMonth =
                  day.getMonth() === selectedMonth.getMonth();

                return (
                  <Card
                    key={dateStr}
                    className={`min-h-[120px] p-2 ${!isCurrentMonth ? "opacity-50" : ""}`}
                  >
                    <div className="text-xs font-semibold mb-2">
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="text-xs bg-primary/10 p-1 rounded truncate"
                        >
                          <div className="font-semibold">
                            {shift.casts.name}
                          </div>
                          <div className="text-muted-foreground">
                            {shift.start_time.slice(0, 5)}～
                            {shift.end_time.slice(0, 5)}
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
    </div>
  );
}
