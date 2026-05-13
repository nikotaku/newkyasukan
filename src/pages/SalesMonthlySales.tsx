import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MonthlyReport {
  month_date: string;
  revenue: number | null;
  customer_count: number | null;
  session_count: number | null;
  new_customers: number | null;
  repeat_customers: number | null;
  therapist_pay: number | null;
  discount: number | null;
  gross_profit: number | null;
}

const yen = (v: number | null) =>
  v == null ? "—" : `¥${v.toLocaleString()}`;
const num = (v: number | null) =>
  v == null ? "—" : v.toLocaleString();

export default function SalesMonthlySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchReports();
  }, [user]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("*")
        .order("month_date", { ascending: false });
      if (error && error.code !== "PGRST116") throw error;
      setReports(data || []);
    } catch (e) {
      console.error("Error fetching monthly reports:", e);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = reports.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const avgRevenue = reports.length > 0 ? totalRevenue / reports.length : 0;
  const totalGross = reports.reduce((s, r) => s + (r.gross_profit ?? 0), 0);

  const growthRate = (current: MonthlyReport, prev: MonthlyReport | undefined) => {
    if (!prev || !prev.revenue || !current.revenue) return null;
    return ((current.revenue - prev.revenue) / prev.revenue) * 100;
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">月別レポート</h1>
            <p className="text-muted-foreground">月ごとの売上・客数・粗利推移</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">累計売上</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{yen(totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">{reports.length}ヶ月分</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">平均月売上</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{yen(Math.round(avgRevenue))}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">累計粗利</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{yen(totalGross)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  粗利率 {totalRevenue > 0 ? ((totalGross / totalRevenue) * 100).toFixed(1) : "—"}%
                </p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : reports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                データがありません
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">年月</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">売上</th>
                        <th className="text-right py-3 px-3 font-semibold whitespace-nowrap">前月比</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">客数</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">件数</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">新規</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">リピ</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">給与</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">割引</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">粗利</th>
                        <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">粗利率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((row, idx) => {
                        const prev = reports[idx + 1];
                        const rate = growthRate(row, prev);
                        const grossRate = row.revenue && row.gross_profit
                          ? (row.gross_profit / row.revenue) * 100
                          : null;
                        return (
                          <tr key={row.month_date} className="border-b hover:bg-muted/40 transition-colors">
                            <td className="py-3 px-4 font-semibold whitespace-nowrap">
                              {format(parseISO(row.month_date), "yyyy年M月", { locale: ja })}
                            </td>
                            <td className="py-3 px-4 text-right font-medium tabular-nums">
                              {yen(row.revenue)}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap tabular-nums">
                              {rate == null ? (
                                <Minus size={12} className="inline text-muted-foreground" />
                              ) : rate >= 0 ? (
                                <span className="text-green-600 flex items-center justify-end gap-0.5">
                                  <TrendingUp size={12} />+{rate.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-red-500 flex items-center justify-end gap-0.5">
                                  <TrendingDown size={12} />{rate.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">{num(row.customer_count)}</td>
                            <td className="py-3 px-4 text-right tabular-nums">{num(row.session_count)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-blue-600">{num(row.new_customers)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-green-600">{num(row.repeat_customers)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{yen(row.therapist_pay)}</td>
                            <td className="py-3 px-4 text-right tabular-nums">
                              {row.discount == null ? "—" : (
                                <span className={row.discount < 0 ? "text-red-500" : ""}>
                                  {row.discount < 0 ? `-¥${Math.abs(row.discount).toLocaleString()}` : `¥${row.discount.toLocaleString()}`}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-medium tabular-nums">{yen(row.gross_profit)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                              {grossRate != null ? `${grossRate.toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
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
