import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface HourlyAccess {
  hour: number;
  visits: number;
  unique_visitors: number;
}

export default function AnalyticsHourlyAccess() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<HourlyAccess[]>([]);
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
        .from("hp_analytics_hourly")
        .select("*")
        .order("hour", { ascending: true });

      if (error && error.code !== "PGRST116") throw error;
      setData(data || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const maxVisits = Math.max(...(data.map((d) => d.visits || 0) || [0]));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">時間別アクセス</h1>
            <p className="text-muted-foreground">
              時間別のアクセス統計を表示
            </p>
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
                <CardTitle>時間別アクセス</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                  {Array.from({ length: 24 }, (_, i) => {
                    const hourData = data.find((d) => d.hour === i);
                    const visits = hourData?.visits || 0;
                    const percentage =
                      maxVisits > 0
                        ? ((visits / maxVisits) * 100).toFixed(0)
                        : "0";

                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-20 w-full bg-muted rounded flex items-end justify-center relative">
                          <div
                            className="w-full bg-primary rounded transition-all"
                            style={{
                              height: `${percentage}%`,
                            }}
                          />
                        </div>
                        <div className="text-xs font-semibold">
                          {String(i).padStart(2, "0")}:00
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {visits}
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
