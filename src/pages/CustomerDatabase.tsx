import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone: string;
  preferences?: string;
  sales_notes?: string;
  total_spent?: number;
  visit_count?: number;
}

export default function CustomerDatabase() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "preferences";

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchCustomers();
  }, [user]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      const { error } = await supabase
        .from("customers")
        .update({ preferences: selected.preferences, sales_notes: selected.sales_notes })
        .eq("id", selected.id);
      if (error) throw error;
      fetchCustomers();
    } catch (error) {
      console.error("Error saving customer:", error);
    }
  };

  const filtered = customers.filter(
    (c) => c.name?.includes(searchQuery) || c.phone?.includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">顧客一覧</h1>
            <p className="text-muted-foreground">顧客の好み・営業情報管理</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} className="text-muted-foreground" />
                <Input placeholder="名前・電話番号で検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              {loading ? (
                <div className="text-center text-muted-foreground py-4">読み込み中...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">顧客なし</div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selected?.id === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-sm font-semibold">{c.name}</div>
                      <div className="text-xs opacity-70">{c.phone}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              {selected ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{selected.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{selected.phone}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-muted-foreground">総売上</div>
                        <div className="font-bold">¥{(selected.total_spent || 0).toLocaleString()}</div>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-muted-foreground">来店回数</div>
                        <div className="font-bold">{selected.visit_count || 0}回</div>
                      </div>
                    </div>

                    <Tabs defaultValue={defaultTab}>
                      <TabsList className="w-full mb-4">
                        <TabsTrigger value="preferences" className="flex-1">好み</TabsTrigger>
                        <TabsTrigger value="sales" className="flex-1">営業</TabsTrigger>
                      </TabsList>
                      <TabsContent value="preferences">
                        <div>
                          <Label>好み・特記事項</Label>
                          <Textarea
                            value={selected.preferences || ""}
                            onChange={(e) => setSelected({ ...selected, preferences: e.target.value })}
                            placeholder="好みのコース、セラピスト、特記事項など..."
                            rows={8}
                            className="mt-2"
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="sales">
                        <div>
                          <Label>営業メモ</Label>
                          <Textarea
                            value={selected.sales_notes || ""}
                            onChange={(e) => setSelected({ ...selected, sales_notes: e.target.value })}
                            placeholder="再来店施策、連絡履歴など..."
                            rows={8}
                            className="mt-2"
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                    <Button className="mt-4 w-full" onClick={handleSave}>保存</Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                    左から顧客を選択してください
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
