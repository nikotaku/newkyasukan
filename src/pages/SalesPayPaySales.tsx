import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface PayPaySalesData {
  id: string;
  date: string;
  amount: number;
  transaction_count: number;
}

export default function SalesPayPaySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paypayData, setPayPayData] = useState<PayPaySalesData[]>([]);
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
      fetchPayPaySales();
    }
  }, [user]);

  const fetchPayPaySales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("paypay_sales")
        .select("*")
        .order("date", { ascending: false })
        .limit(30);

      if (error && error.code !== "PGRST116") throw error;
      setPayPayData(data || []);
    } catch (error) {
      console.error("Error fetching PayPay sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = paypayData.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalTransactions = paypayData.reduce((sum, s) => sum + (s.transaction_count || 0), 0);
  const averageTransaction = totalTransactions > 0 ? totalAmount / totalTransactions : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">PayPay売上</h1>
            <p className="text-muted-foreground">
              PayPay決済の売上管理
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  合計売上
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalAmount.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  取引数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalTransactions}件
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  平均取引額
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{Math.round(averageTransaction).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : paypayData.length === 0 ? (
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
                        <th className="text-left py-3 px-4 font-semibold">取引数</th>
                        <th className="text-left py-3 px-4 font-semibold">売上</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paypayData.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            {format(new Date(item.date), "yyyy/MM/dd", { locale: ja })}
                          </td>
                          <td className="py-3 px-4">
                            {item.transaction_count || 0}件
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            ¥{(item.amount || 0).toLocaleString()}
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
