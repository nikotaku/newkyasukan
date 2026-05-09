import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface DailySalesTarget {
  id: string;
  date: string;
  target_amount: number;
  actual_amount: number;
}

export default function SalesDailySalesTarget() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [targets, setTargets] = useState<DailySalesTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchTargets();
    }
  }, [user]);

  const fetchTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("daily_sales_targets")
        .select("*")
        .order("date", { ascending: false })
        .limit(30);

      if (error && error.code !== "PGRST116") throw error;
      setTargets(data || []);
    } catch (error) {
      console.error("Error fetching targets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTarget = async (id: string) => {
    try {
      const { error } = await supabase
        .from("daily_sales_targets")
        .update({ target_amount: editValue })
        .eq("id", id);

      if (error) throw error;
      setEditingId(null);
      fetchTargets();
    } catch (error) {
      console.error("Error updating target:", error);
    }
  };

  const totalTarget = targets.reduce((sum, t) => sum + (t.target_amount || 0), 0);
  const totalActual = targets.reduce((sum, t) => sum + (t.actual_amount || 0), 0);
  const achievement = totalTarget > 0 ? ((totalActual / totalTarget) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">日別売上目標</h1>
            <p className="text-muted-foreground">
              日ごとの売上目標設定と達成状況
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  目標合計
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalTarget.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  実績合計
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalActual.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  達成率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${achievement >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                  {achievement.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : targets.length === 0 ? (
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
                        <th className="text-left py-3 px-4 font-semibold">目標</th>
                        <th className="text-left py-3 px-4 font-semibold">実績</th>
                        <th className="text-left py-3 px-4 font-semibold">達成率</th>
                        <th className="text-left py-3 px-4 font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((target) => {
                        const rate = target.target_amount > 0 ? ((target.actual_amount || 0) / target.target_amount) * 100 : 0;
                        return (
                          <tr
                            key={target.id}
                            className="border-b hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 px-4 font-semibold">
                              {format(new Date(target.date), "yyyy/MM/dd", { locale: ja })}
                            </td>
                            <td className="py-3 px-4">
                              {editingId === target.id ? (
                                <Input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(Number(e.target.value))}
                                  className="w-32"
                                />
                              ) : (
                                `¥${(target.target_amount || 0).toLocaleString()}`
                              )}
                            </td>
                            <td className="py-3 px-4">
                              ¥{(target.actual_amount || 0).toLocaleString()}
                            </td>
                            <td className={`py-3 px-4 font-semibold ${rate >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                              {rate.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4">
                              {editingId === target.id ? (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveTarget(target.id)}
                                  >
                                    保存
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingId(null)}
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingId(target.id);
                                    setEditValue(target.target_amount);
                                  }}
                                >
                                  編集
                                </Button>
                              )}
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
