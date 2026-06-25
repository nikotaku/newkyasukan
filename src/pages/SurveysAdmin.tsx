import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Survey {
  id: string;
  rating: number;
  therapist_name: string | null;
  good_points: string | null;
  improvement_points: string | null;
  created_at: string;
}

const STARS = [1, 2, 3, 4, 5];

export default function SurveysAdmin() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("customer_surveys")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setSurveys((data as Survey[]) || []);
        setLoading(false);
      });
  }, [user]);

  const avg = surveys.length
    ? (surveys.reduce((s, r) => s + r.rating, 0) / surveys.length).toFixed(1)
    : "-";

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">アンケート一覧</h1>
          <p className="text-muted-foreground text-sm mb-6">
            サンクスSMSから回収したアンケート結果
          </p>

          {/* サマリー */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground">回答件数</p>
                <p className="text-3xl font-bold mt-1">{surveys.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground">平均評価</p>
                <p className="text-3xl font-bold mt-1">
                  ★ {avg}
                </p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground">読み込み中...</p>
          ) : surveys.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                まだ回答がありません
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {surveys.map((s) => (
                <Card key={s.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400 font-bold">
                          {"★".repeat(s.rating)}
                          <span className="text-gray-300">{"★".repeat(5 - s.rating)}</span>
                        </span>
                        {s.therapist_name && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {s.therapist_name}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(s.created_at), "M/d(E) HH:mm", { locale: ja })}
                      </span>
                    </div>
                    {s.good_points && (
                      <div className="text-sm mb-1">
                        <span className="text-xs font-medium text-green-700 mr-1">良かった点</span>
                        {s.good_points}
                      </div>
                    )}
                    {s.improvement_points && (
                      <div className="text-sm text-muted-foreground">
                        <span className="text-xs font-medium text-orange-600 mr-1">改善点</span>
                        {s.improvement_points}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
