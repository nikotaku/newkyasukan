import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TherapistRow {
  id: string;
  name: string;
  photo: string | null;
  count: number;
  revenue: number;
  avg: number;
}

const yen = (v: number) => `¥${v.toLocaleString()}`;

export default function SalesTherapistBreakdown() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<TherapistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, month]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const from = format(startOfMonth(month), "yyyy-MM-dd");
      const to = format(endOfMonth(month), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("reservations")
        .select("cast_id, price, casts(id, name, photo)")
        .gte("reservation_date", from)
        .lte("reservation_date", to)
        .not("cast_id", "is", null)
        .neq("status", "cancelled");

      if (error) throw error;

      // Aggregate by cast
      const map = new Map<string, { name: string; photo: string | null; count: number; revenue: number }>();
      for (const r of (data || [])) {
        const cast = r.casts as any;
        if (!cast) continue;
        const existing = map.get(cast.id);
        if (existing) {
          existing.count += 1;
          existing.revenue += r.price ?? 0;
        } else {
          map.set(cast.id, { name: cast.name, photo: cast.photo, count: 1, revenue: r.price ?? 0 });
        }
      }

      const result: TherapistRow[] = Array.from(map.entries())
        .map(([id, v]) => ({
          id,
          name: v.name,
          photo: v.photo,
          count: v.count,
          revenue: v.revenue,
          avg: v.count > 0 ? Math.round(v.revenue / v.count) : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      setRows(result);
    } catch (e) {
      console.error("Error fetching therapist breakdown:", e);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">セラピスト別売上</h1>
            {/* Month navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm font-semibold min-w-[90px] text-center">
                {format(month, "yyyy年M月", { locale: ja })}
              </span>
              <Button variant="outline" size="sm" onClick={() => setMonth(subMonths(month, -1))} disabled={format(month, "yyyy-MM") >= format(new Date(), "yyyy-MM")}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {format(month, "yyyy年M月", { locale: ja })}の予約データがありません
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="py-3 px-4 text-left font-semibold">セラピスト</th>
                        <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">予約件数</th>
                        <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">売上</th>
                        <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">平均単価</th>
                        <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">構成比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full overflow-hidden bg-muted shrink-0">
                                {row.photo ? (
                                  <img src={row.photo} alt={row.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                    {row.name.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <span className="font-medium">{row.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">{row.count}件</td>
                          <td className="py-3 px-4 text-right tabular-nums font-medium">{yen(row.revenue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{yen(row.avg)}</td>
                          <td className="py-3 px-4 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-muted-foreground">
                                {totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : "0.0"}%
                              </span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: totalRevenue > 0 ? `${(row.revenue / totalRevenue) * 100}%` : "0%" }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/20">
                      <tr>
                        <td className="py-3 px-4 font-semibold">合計</td>
                        <td className="py-3 px-4 text-right tabular-nums font-semibold">{totalCount}件</td>
                        <td className="py-3 px-4 text-right tabular-nums font-semibold">{yen(totalRevenue)}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                          {totalCount > 0 ? yen(Math.round(totalRevenue / totalCount)) : "—"}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
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
