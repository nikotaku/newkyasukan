import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface TrackingData {
  source: string;
  medium: string;
  visits: number;
  unique_visitors: number;
  conversion_rate: number;
}

export default function AnalyticsTracking() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<TrackingData[]>([]);
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
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hp_analytics_traffic")
        .select("*")
        .order("visits", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setData(data || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const sourceGroups = Array.from(
    new Set(data.map((d) => d.source))
  );

  const totalVisits = data.reduce((sum, d) => sum + (d.visits || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">トラッキング（流入）</h1>
            <p className="text-muted-foreground">
              流入元別のアクセス統計を表示
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  総流入数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalVisits.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  流入元の数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sourceGroups.length}</div>
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
            <div className="space-y-6">
              {sourceGroups.map((source) => {
                const sourceData = data.filter((d) => d.source === source);
                const sourceTotal = sourceData.reduce(
                  (sum, d) => sum + (d.visits || 0),
                  0
                );
                const sourcePercentage =
                  totalVisits > 0 ? (sourceTotal / totalVisits) * 100 : 0;

                return (
                  <Card key={source}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>{source}</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {sourcePercentage.toFixed(1)}%
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {sourceData.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div>
                              <div className="font-semibold text-sm">
                                {item.medium}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.unique_visitors}ユーザー
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="font-bold">
                                {(item.visits || 0).toLocaleString()}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {((item.conversion_rate || 0) * 100).toFixed(
                                  1
                                )}%
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
