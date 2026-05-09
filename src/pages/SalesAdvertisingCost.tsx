import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface AdvertisingCostData {
  id: string;
  date: string;
  platform: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export default function SalesAdvertisingCost() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [costs, setCosts] = useState<AdvertisingCostData[]>([]);
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
      fetchAdvertisingCosts();
    }
  }, [user]);

  const fetchAdvertisingCosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("advertising_costs")
        .select("*")
        .order("date", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setCosts(data || []);
    } catch (error) {
      console.error("Error fetching advertising costs:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalCost = costs.reduce((sum, c) => sum + (c.cost || 0), 0);
  const totalImpressions = costs.reduce((sum, c) => sum + (c.impressions || 0), 0);
  const totalClicks = costs.reduce((sum, c) => sum + (c.clicks || 0), 0);
  const totalConversions = costs.reduce((sum, c) => sum + (c.conversions || 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0;
  const roas = totalCost > 0 ? (totalConversions / totalCost) : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">広告費管理</h1>
            <p className="text-muted-foreground">
              広告費用と成果の管理
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  合計広告費
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalCost.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  CTR
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {ctr.toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  コンバージョン数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalConversions}件
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : costs.length === 0 ? (
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
                        <th className="text-left py-3 px-4 font-semibold">日付</th>
                        <th className="text-left py-3 px-4 font-semibold">媒体</th>
                        <th className="text-left py-3 px-4 font-semibold">費用</th>
                        <th className="text-left py-3 px-4 font-semibold">インプレッション</th>
                        <th className="text-left py-3 px-4 font-semibold">クリック</th>
                        <th className="text-left py-3 px-4 font-semibold">コンバージョン</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map((cost) => (
                        <tr
                          key={cost.id}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            {format(new Date(cost.date), "yyyy/MM/dd", { locale: ja })}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {cost.platform}
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            ¥{(cost.cost || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {(cost.impressions || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {cost.clicks || 0}
                          </td>
                          <td className="py-3 px-4">
                            {cost.conversions || 0}
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
