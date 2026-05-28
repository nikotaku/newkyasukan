import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

interface MonthlyRow {
  month_date: string;
  discount: number | null;
  transportation_fee: number | null;
  revenue: number | null;
}

const yen = (v: number | null) =>
  v == null || v === 0 ? "¥0" : `¥${v.toLocaleString()}`;

export default function SalesDeductionSummary() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("month_date, discount, transportation_fee, revenue")
        .order("month_date", { ascending: false });
      if (error && error.code !== "PGRST116") throw error;
      setRows(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totalDiscount = rows.reduce((s, r) => s + Math.abs(r.discount ?? 0), 0);
  const totalTransport = rows.reduce((s, r) => s + (r.transportation_fee ?? 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">控除集計</h1>
            <p className="text-muted-foreground text-sm">月次の控除・交通費の推移</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">データがありません</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        {["月", "売上", "控除", "交通費", "控除合計"].map((h) => (
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
                      {rows.map((row) => {
                        const deduction = Math.abs(row.discount ?? 0);
                        const transport = row.transportation_fee ?? 0;
                        const total = deduction + transport;
                        return (
                          <tr key={row.month_date} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4 font-semibold whitespace-nowrap">
                              {format(parseISO(row.month_date), "yyyy年M月", { locale: ja })}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">{yen(row.revenue)}</td>
                            <td className="py-3 px-4 text-right tabular-nums">{yen(deduction)}</td>
                            <td className="py-3 px-4 text-right tabular-nums">{yen(transport)}</td>
                            <td className="py-3 px-4 text-right tabular-nums font-semibold">{yen(total)}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="py-3 px-4">合計</td>
                        <td className="py-3 px-4 text-right tabular-nums">{yen(totalRevenue)}</td>
                        <td className="py-3 px-4 text-right tabular-nums">{yen(totalDiscount)}</td>
                        <td className="py-3 px-4 text-right tabular-nums">{yen(totalTransport)}</td>
                        <td className="py-3 px-4 text-right tabular-nums">{yen(totalDiscount + totalTransport)}</td>
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
