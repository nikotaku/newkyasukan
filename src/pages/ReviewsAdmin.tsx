import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Review {
  id: string;
  rating: number;
  therapist_name: string | null;
  review_text: string;
  allow_publish: boolean;
  created_at: string;
}

export default function ReviewsAdmin() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "publish">("all");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("customer_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReviews((data as Review[]) || []);
        setLoading(false);
      });
  }, [user]);

  const displayed = filter === "publish" ? reviews.filter((r) => r.allow_publish) : reviews;
  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "-";
  const publishCount = reviews.filter((r) => r.allow_publish).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">口コミ一覧</h1>
          <p className="text-muted-foreground text-sm mb-6">
            サンクスSMSから回収したお客様の口コミ
          </p>

          {/* サマリー */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground">件数</p>
                <p className="text-3xl font-bold mt-1">{reviews.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground">平均評価</p>
                <p className="text-3xl font-bold mt-1">★ {avg}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground">公開許可</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{publishCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* フィルター */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              すべて
            </button>
            <button
              onClick={() => setFilter("publish")}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === "publish" ? "bg-green-600 text-white" : "bg-muted hover:bg-muted/80"
              }`}
            >
              公開許可のみ ({publishCount})
            </button>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground">読み込み中...</p>
          ) : displayed.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                {filter === "publish" ? "公開許可の口コミがありません" : "まだ口コミがありません"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {displayed.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-yellow-400 font-bold">
                          {"★".repeat(r.rating)}
                          <span className="text-gray-300">{"★".repeat(5 - r.rating)}</span>
                        </span>
                        {r.therapist_name && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {r.therapist_name}
                          </span>
                        )}
                        {r.allow_publish && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                            公開許可
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {format(new Date(r.created_at), "M/d(E) HH:mm", { locale: ja })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.review_text}</p>
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
