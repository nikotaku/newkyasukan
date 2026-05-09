import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface ReferralFeeData {
  id: string;
  date: string;
  referrer_name: string;
  customer_name: string;
  commission_rate: number;
  sales_amount: number;
  fee: number;
}

export default function SalesReferralFees() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fees, setFees] = useState<ReferralFeeData[]>([]);
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
      fetchReferralFees();
    }
  }, [user]);

  const fetchReferralFees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("referral_fees")
        .select("*")
        .order("date", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setFees(data || []);
    } catch (error) {
      console.error("Error fetching referral fees:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalFees = fees.reduce((sum, f) => sum + (f.fee || 0), 0);
  const totalSales = fees.reduce((sum, f) => sum + (f.sales_amount || 0), 0);
  const feeRate = totalSales > 0 ? ((totalFees / totalSales) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">紹介費管理</h1>
            <p className="text-muted-foreground">
              紹介手数料の管理
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  合計紹介費
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalFees.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  対象売上
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
                  手数料率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {feeRate.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : fees.length === 0 ? (
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
                        <th className="text-left py-3 px-4 font-semibold">紹介者</th>
                        <th className="text-left py-3 px-4 font-semibold">顧客</th>
                        <th className="text-left py-3 px-4 font-semibold">売上</th>
                        <th className="text-left py-3 px-4 font-semibold">手数料率</th>
                        <th className="text-left py-3 px-4 font-semibold">手数料</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.map((fee) => (
                        <tr
                          key={fee.id}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            {format(new Date(fee.date), "yyyy/MM/dd", { locale: ja })}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {fee.referrer_name}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {fee.customer_name}
                          </td>
                          <td className="py-3 px-4">
                            ¥{(fee.sales_amount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {(fee.commission_rate || 0).toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            ¥{(fee.fee || 0).toLocaleString()}
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
