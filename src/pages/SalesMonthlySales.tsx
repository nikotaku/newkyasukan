import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

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
  v == null || v === 0 ? "¥0" : `¥${v.toLocaleString()}`;
const num = (v: number | null) => (v == null ? 0 : v);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded shadow px-3 py-2 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-[#38bdf8]">売上: ¥{payload[0]?.value?.toLocaleString()}</p>
    </div>
  );
};

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

  // Chart data: oldest first
  const chartData = [...reports]
    .reverse()
    .map((r) => ({
      label: format(parseISO(r.month_date), "M/1", { locale: ja }),
      売上: r.revenue ?? 0,
    }));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">月別売上</h1>
          </div>

          {/* Line Chart */}
          {!loading && chartData.length > 0 && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4 text-sm font-medium text-[#38bdf8]">
                  <span className="inline-block w-6 border-t-2 border-[#38bdf8]" />
                  売上
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
                      width={42}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="売上"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#38bdf8" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Table */}
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
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        {["月", "売上", "出勤", "予約", "新規", "リピート", "報酬", "経費", "利益"].map((h) => (
                          <th key={h} className="py-3 px-4 font-semibold whitespace-nowrap text-left first:text-left [&:not(:first-child)]:text-right">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((row) => (
                        <tr key={row.month_date} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-semibold whitespace-nowrap">
                            {format(parseISO(row.month_date), "yyyy年M月", { locale: ja })}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">{yen(row.revenue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums">{num(row.customer_count)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-blue-500">{num(row.session_count)}</td>
                          <td className="py-3 px-4 text-right tabular-nums">{num(row.new_customers)}</td>
                          <td className="py-3 px-4 text-right tabular-nums">{num(row.repeat_customers)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-red-500">{yen(row.therapist_pay)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-red-500">{yen(row.discount)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-red-500">{yen(row.gross_profit)}</td>
                        </tr>
                      ))}
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
