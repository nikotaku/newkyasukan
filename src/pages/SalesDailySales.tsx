import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  format, parseISO, startOfMonth, endOfMonth,
  eachDayOfInterval, subMonths, addMonths, isToday,
} from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DaySummary {
  date: string;
  revenue: number;
  count: number;
  completedCount: number;
}

const yen = (v: number) => v === 0 ? "¥0" : `¥${v.toLocaleString()}`;

export default function SalesDailySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [baseDate, setBaseDate] = useState(new Date());
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, baseDate]);

  const fetchData = async () => {
    setLoading(true);
    const from = format(startOfMonth(baseDate), "yyyy-MM-dd");
    const to = format(endOfMonth(baseDate), "yyyy-MM-dd");
    try {
      const { data, error } = await supabase
        .from("reservations")
        .select("start_time, price, status")
        .gte("start_time", `${from}T00:00:00`)
        .lte("start_time", `${to}T23:59:59`)
        .neq("status", "cancelled");
      if (error && error.code !== "PGRST116") throw error;

      const byDate: Record<string, DaySummary> = {};
      for (const r of data || []) {
        const d = r.start_time.slice(0, 10);
        if (!byDate[d]) byDate[d] = { date: d, revenue: 0, count: 0, completedCount: 0 };
        byDate[d].count += 1;
        if (r.status === "completed") {
          byDate[d].revenue += r.price ?? 0;
          byDate[d].completedCount += 1;
        }
      }

      const days = eachDayOfInterval({
        start: startOfMonth(baseDate),
        end: endOfMonth(baseDate),
      });

      setSummaries(
        days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          return byDate[key] ?? { date: key, revenue: 0, count: 0, completedCount: 0 };
        })
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const monthTotal = summaries.reduce((s, d) => ({ revenue: s.revenue + d.revenue, count: s.count + d.count, completedCount: s.completedCount + d.completedCount }), { revenue: 0, count: 0, completedCount: 0 });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">日別売上</h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setBaseDate(subMonths(baseDate, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-semibold w-24 text-center">
                {format(baseDate, "yyyy年M月", { locale: ja })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setBaseDate(addMonths(baseDate, 1))}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        {["日付", "売上", "完了件数", "予約件数"].map((h) => (
                          <th
                            key={h}
                            className="py-3 px-4 font-semibold whitespace-nowrap text-left first:text-left [&:not(:first-child)]:text-right"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((row) => {
                        const d = parseISO(row.date);
                        const dayOfWeek = format(d, "E", { locale: ja });
                        const isSun = format(d, "e") === "1";
                        const isSat = format(d, "e") === "7";
                        const today = isToday(d);
                        return (
                          <tr
                            key={row.date}
                            className={`border-b transition-colors ${
                              today ? "bg-primary/5" : "hover:bg-muted/30"
                            } ${row.count === 0 ? "opacity-50" : ""}`}
                          >
                            <td className={`py-2.5 px-4 font-medium whitespace-nowrap ${
                              isSun ? "text-red-500" : isSat ? "text-blue-500" : ""
                            }`}>
                              {format(d, "d日", { locale: ja })}
                              <span className="ml-1 text-xs text-muted-foreground">（{dayOfWeek}）</span>
                              {today && <span className="ml-1 text-xs text-primary">今日</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums font-semibold">
                              {row.revenue > 0 ? yen(row.revenue) : "—"}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-blue-500">
                              {row.completedCount > 0 ? `${row.completedCount}件` : "—"}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums">
                              {row.count > 0 ? `${row.count}件` : "—"}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Monthly total row */}
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="py-3 px-4">合計</td>
                        <td className="py-3 px-4 text-right tabular-nums">{yen(monthTotal.revenue)}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-blue-500">{monthTotal.completedCount}件</td>
                        <td className="py-3 px-4 text-right tabular-nums">{monthTotal.count}件</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
