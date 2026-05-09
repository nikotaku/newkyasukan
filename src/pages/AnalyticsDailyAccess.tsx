import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp } from "lucide-react";

interface DailyAccess {
  date: string;
  visits: number;
  unique_visitors: number;
  page_views: number;
}

export default function AnalyticsDailyAccess() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DailyAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hp_analytics_daily")
        .select("*")
        .order("date", { ascending: false })
        .limit(parseInt(period));

      if (error && error.code !== "PGRST116") throw error;
      setData((data || []).reverse());
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalVisits = data.reduce((sum, d) => sum + (d.visits || 0), 0);
  const avgVisits = data.length > 0 ? Math.round(totalVisits / data.length) : 0;
  const maxVisits = Math.max(...(data.map((d) => d.visits || 0) || [0]));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">日別アクセス</h1>
              <p className="text-muted-foreground">
                日別のアクセス統計を表示
              </p>
            </div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">過去7日</SelectItem>
                <SelectItem value="30">過去30日</SelectItem>
                <SelectItem value="90">過去90日</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  総アクセス数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalVisits.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  期間合計
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  平均アクセス数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgVisits.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  1日あたり
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  最高アクセス数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{maxVisits.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  ピーク日
                </p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : data.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                データがありません
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>日別アクセス推移</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.map((day, idx) => {
                    const percentage =
                      maxVisits > 0
                        ? (((day.visits || 0) / maxVisits) * 100).toFixed(1)
                        : "0";
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-20 text-sm font-semibold text-right">
                          {day.date}
                        </div>
                        <div className="flex-1 bg-muted h-8 rounded-md overflow-hidden relative">
                          <div
                            className="bg-primary h-full transition-all"
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                          <div className="absolute inset-0 flex items-center px-2">
                            <span className="text-xs font-semibold text-primary-foreground">
                              {(day.visits || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
