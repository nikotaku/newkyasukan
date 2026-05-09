import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Therapist {
  id: string;
  name: string;
  total_sales?: number;
  shift_count?: number;
  point_balance?: number;
}

export default function TherapistMyPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Therapist | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchTherapists();
  }, [user]);

  const fetchTherapists = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("casts")
        .select("id, name")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setTherapists(data || []);
    } catch (error) {
      console.error("Error fetching therapists:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = therapists.filter((t) => t.name?.includes(searchQuery));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">セラピスト マイページ</h1>
            <p className="text-muted-foreground">各セラピストの情報を確認</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} className="text-muted-foreground" />
                <Input placeholder="検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              {loading ? (
                <div className="text-center text-muted-foreground py-4">読み込み中...</div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selected?.id === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-3">
              {selected ? (
                <div>
                  <h2 className="text-xl font-bold mb-4">{selected.name}</h2>
                  <Tabs defaultValue="sales">
                    <TabsList className="mb-4 flex-wrap">
                      <TabsTrigger value="sales">売上確認</TabsTrigger>
                      <TabsTrigger value="shift">シフト提出</TabsTrigger>
                      <TabsTrigger value="post">ポスト</TabsTrigger>
                      <TabsTrigger value="reservation">予約登録</TabsTrigger>
                      <TabsTrigger value="customers">顧客管理</TabsTrigger>
                      <TabsTrigger value="analytics">分析情報</TabsTrigger>
                      <TabsTrigger value="panel">パネル</TabsTrigger>
                      <TabsTrigger value="points">ポイント確認</TabsTrigger>
                    </TabsList>

                    {["sales", "shift", "post", "reservation", "customers", "analytics", "panel", "points"].map((tab) => (
                      <TabsContent key={tab} value={tab}>
                        <Card>
                          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                            {selected.name} の{tab === "sales" ? "売上確認" : tab === "shift" ? "シフト提出" : tab === "post" ? "ポスト" : tab === "reservation" ? "予約登録" : tab === "customers" ? "顧客管理" : tab === "analytics" ? "分析情報" : tab === "panel" ? "パネル" : "ポイント確認"}
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                    左からセラピストを選択してください
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
