import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface TherapistSales {
  id: string;
  name: string;
  total_sales: number;
  visit_count: number;
  average_visit_price: number;
}

export default function SalesTherapistBreakdown() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [therapists, setTherapists] = useState<TherapistSales[]>([]);
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
      fetchTherapists();
    }
  }, [user]);

  const fetchTherapists = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("therapist_sales")
        .select("*")
        .order("total_sales", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setTherapists(data || []);
    } catch (error) {
      console.error("Error fetching therapist sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = therapists.reduce((sum, t) => sum + (t.total_sales || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">セラピスト別売上</h1>
            <p className="text-muted-foreground">
              セラピスト別の売上統計
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                総売上
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ¥{totalSales.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : therapists.length === 0 ? (
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
                        <th className="text-left py-3 px-4 font-semibold">セラピスト</th>
                        <th className="text-left py-3 px-4 font-semibold">売上</th>
                        <th className="text-left py-3 px-4 font-semibold">来店回数</th>
                        <th className="text-left py-3 px-4 font-semibold">平均客単価</th>
                      </tr>
                    </thead>
                    <tbody>
                      {therapists.map((therapist) => (
                        <tr
                          key={therapist.id}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4 font-semibold">{therapist.name}</td>
                          <td className="py-3 px-4">
                            ¥{(therapist.total_sales || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {therapist.visit_count || 0}回
                          </td>
                          <td className="py-3 px-4">
                            ¥{(therapist.average_visit_price || 0).toLocaleString()}
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
