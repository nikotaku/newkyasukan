import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";

interface PageStay {
  page_path: string;
  page_title: string;
  avg_stay_seconds: number;
  visit_count: number;
}

export default function AnalyticsAverageStay() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<PageStay[]>([]);
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
        .from("hp_analytics_pages")
        .select("*")
        .order("avg_stay_seconds", { ascending: false })
        .limit(20);

      if (error && error.code !== "PGRST116") throw error;
      setData(data || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatSeconds = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const avgStay =
    data.length > 0
      ? data.reduce((sum, d) => sum + d.avg_stay_seconds, 0) / data.length
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">平均滞在時間</h1>
            <p className="text-muted-foreground">
              ページ別の平均滞在時間を表示
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">全体平均滞在時間</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Clock className="text-primary" size={24} />
                <div>
                  <div className="text-2xl font-bold">
                    {formatSeconds(Math.round(avgStay))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    サイト全体
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                <CardTitle>ページ別平均滞在時間</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.map((page, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-sm">
                          {page.page_title || page.page_path}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {page.visit_count}回訪問
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {formatSeconds(Math.round(page.avg_stay_seconds))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          平均滞在時間
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
