import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface PriceData {
  service_name: string;
  price: number;
  sales_count: number;
  total_revenue: number;
  percentage: number;
}

export default function SalesPriceAnalysis() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prices, setPrices] = useState<PriceData[]>([]);
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
      fetchPriceData();
    }
  }, [user]);

  const fetchPriceData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("price_analysis")
        .select("*")
        .order("total_revenue", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setPrices(data || []);
    } catch (error) {
      console.error("Error fetching price data:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = prices.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
  const averagePrice = prices.length > 0 ? prices.reduce((sum, p) => sum + (p.price || 0), 0) / prices.length : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">単価分析</h1>
            <p className="text-muted-foreground">
              サービス別の単価と売上分析
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  総売上
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalRevenue.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  平均単価
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{Math.round(averagePrice).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : prices.length === 0 ? (
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
                        <th className="text-left py-3 px-4 font-semibold">サービス</th>
                        <th className="text-left py-3 px-4 font-semibold">単価</th>
                        <th className="text-left py-3 px-4 font-semibold">販売数</th>
                        <th className="text-left py-3 px-4 font-semibold">売上</th>
                        <th className="text-left py-3 px-4 font-semibold">割合</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prices.map((price, idx) => (
                        <tr
                          key={idx}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4 font-semibold">{price.service_name}</td>
                          <td className="py-3 px-4">
                            ¥{(price.price || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {price.sales_count || 0}件
                          </td>
                          <td className="py-3 px-4">
                            ¥{(price.total_revenue || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {(price.percentage || 0).toFixed(1)}%
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
