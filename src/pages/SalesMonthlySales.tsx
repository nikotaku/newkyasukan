import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface MonthlySalesData {
  year: number;
  month: number;
  sales: number;
  growth_rate: number;
}

export default function SalesMonthlySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sales, setSales] = useState<MonthlySalesData[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMonthlySales();
    }
  }, [user]);

  const fetchMonthlySales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("monthly_sales")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setSales(data || []);
    } catch (error) {
      console.error("Error fetching monthly sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = sales.reduce((sum, s) => sum + (s.sales || 0), 0);
  const averageSales = sales.length > 0 ? totalSales / sales.length : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">月別売上</h1>
            <p className="text-muted-foreground">
              月ごとの売上推移
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  累計売上
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalSales.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  平均月売上
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{Math.round(averageSales).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  データ件数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {sales.length}ヶ月
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : sales.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                データがありません
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold">年月</th>
                        <th className="text-left py-3 px-4 font-semibold">売上</th>
                        <th className="text-left py-3 px-4 font-semibold">前月比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((item, idx) => (
                        <tr
                          key={idx}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4 font-semibold">
                            {item.year}年{String(item.month).padStart(2, "0")}月
                          </td>
                          <td className="py-3 px-4">
                            ¥{(item.sales || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={item.growth_rate >= 0 ? "text-green-600" : "text-red-600"}>
                              {item.growth_rate >= 0 ? "+" : ""}{(item.growth_rate || 0).toFixed(1)}%
                            </span>
                          </td>
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
