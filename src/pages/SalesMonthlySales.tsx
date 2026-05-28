import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
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
  transportation_fee: number | null;
}

type EditableField = "discount" | "transportation_fee";

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
  const [editingCell, setEditingCell] = useState<{ month: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState("");

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

  const startEdit = (month: string, field: EditableField, current: number | null) => {
    setEditingCell({ month, field });
    setEditValue(String(Math.abs(current ?? 0)));
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const value = parseInt(editValue) || 0;
    const prev = editingCell;
    setEditingCell(null);
    try {
      const { error } = await supabase
        .from("monthly_reports")
        .update({ [prev.field]: value })
        .eq("month_date", prev.month);
      if (error) throw error;
      setReports((rs) =>
        rs.map((r) =>
          r.month_date === prev.month ? { ...r, [prev.field]: value } : r
        )
      );
    } catch (e: any) {
      console.error(e);
      toast.error(`保存に失敗しました：${e?.message ?? "不明なエラー"}`);
      fetchReports();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingCell(null);
  };

  // Chart data: oldest first
  const chartData = [...reports]
    .reverse()
    .map((r) => ({
      label: format(parseISO(r.month_date), "M/1", { locale: ja }),
      売上: r.revenue ?? 0,
    }));

  const headers = ["月", "売上", "出勤", "予約", "新規", "リピート", "報酬", "控除", "交通費", "利益"];

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
                        {headers.map((h) => (
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
                      {reports.map((row) => {
                        const isEditingDiscount =
                          editingCell?.month === row.month_date && editingCell?.field === "discount";
                        const isEditingTransport =
                          editingCell?.month === row.month_date && editingCell?.field === "transportation_fee";
                        return (
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

                            {/* 控除（編集可） */}
                            {isEditingDiscount ? (
                              <td className="py-1 px-4 text-right">
                                <input
                                  type="number"
                                  autoFocus
                                  min="0"
                                  className="w-24 text-right border rounded px-1 py-0.5 text-sm bg-background"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={handleKeyDown}
                                />
                              </td>
                            ) : (
                              <td
                                className="py-3 px-4 text-right tabular-nums cursor-pointer hover:bg-muted/50"
                                onClick={() => startEdit(row.month_date, "discount", row.discount)}
                              >
                                {yen(Math.abs(num(row.discount)))}
                              </td>
                            )}

                            {/* 交通費（編集可） */}
                            {isEditingTransport ? (
                              <td className="py-1 px-4 text-right">
                                <input
                                  type="number"
                                  autoFocus
                                  min="0"
                                  className="w-24 text-right border rounded px-1 py-0.5 text-sm bg-background"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={handleKeyDown}
                                />
                              </td>
                            ) : (
                              <td
                                className="py-3 px-4 text-right tabular-nums cursor-pointer hover:bg-muted/50"
                                onClick={() => startEdit(row.month_date, "transportation_fee", row.transportation_fee)}
                              >
                                {yen(row.transportation_fee)}
                              </td>
                            )}

                            <td className="py-3 px-4 text-right tabular-nums text-red-500">{yen(row.gross_profit)}</td>
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
