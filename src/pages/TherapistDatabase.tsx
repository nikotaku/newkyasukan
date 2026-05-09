import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

interface TherapistProfile {
  id: string;
  name: string;
  mbti: string;
  birthplace: string;
  career_history: string;
  massage_skills: string;
  training_count: number;
  bust: number;
  waist: number;
  hip: number;
  height: number;
  weight: number;
}

export default function TherapistDatabase() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [therapists, setTherapists] = useState<TherapistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<TherapistProfile | null>(null);

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
        .from("therapist_profiles")
        .select("*")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setTherapists(data || []);
    } catch (error) {
      console.error("Error fetching therapists:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      const { error } = await supabase
        .from("therapist_profiles")
        .upsert(selected, { onConflict: "id" });
      if (error) throw error;
      fetchTherapists();
    } catch (error) {
      console.error("Error saving therapist:", error);
    }
  };

  const filtered = therapists.filter((t) =>
    t.name?.includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">セラピストデータベース</h1>
            <p className="text-muted-foreground">プロフィール・スキル情報の管理</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} className="text-muted-foreground" />
                <Input
                  placeholder="名前で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {loading ? (
                <div className="text-center text-muted-foreground py-4">読み込み中...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">データなし</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selected?.id === t.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      {t.name}
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
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="basic">
                      <TabsList className="mb-4">
                        <TabsTrigger value="basic">基本</TabsTrigger>
                        <TabsTrigger value="body">身体</TabsTrigger>
                        <TabsTrigger value="skill">スキル</TabsTrigger>
                      </TabsList>

                      <TabsContent value="basic" className="space-y-4">
                        <div>
                          <Label>MBTI</Label>
                          <Input value={selected.mbti || ""} onChange={(e) => setSelected({ ...selected, mbti: e.target.value })} />
                        </div>
                        <div>
                          <Label>出身地</Label>
                          <Input value={selected.birthplace || ""} onChange={(e) => setSelected({ ...selected, birthplace: e.target.value })} />
                        </div>
                        <div>
                          <Label>過去の経歴</Label>
                          <Textarea value={selected.career_history || ""} onChange={(e) => setSelected({ ...selected, career_history: e.target.value })} rows={4} />
                        </div>
                      </TabsContent>

                      <TabsContent value="body" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>身長 (cm)</Label>
                            <Input type="number" value={selected.height || ""} onChange={(e) => setSelected({ ...selected, height: Number(e.target.value) })} />
                          </div>
                          <div>
                            <Label>体重 (kg)</Label>
                            <Input type="number" value={selected.weight || ""} onChange={(e) => setSelected({ ...selected, weight: Number(e.target.value) })} />
                          </div>
                          <div>
                            <Label>バスト (cm)</Label>
                            <Input type="number" value={selected.bust || ""} onChange={(e) => setSelected({ ...selected, bust: Number(e.target.value) })} />
                          </div>
                          <div>
                            <Label>ウエスト (cm)</Label>
                            <Input type="number" value={selected.waist || ""} onChange={(e) => setSelected({ ...selected, waist: Number(e.target.value) })} />
                          </div>
                          <div>
                            <Label>ヒップ (cm)</Label>
                            <Input type="number" value={selected.hip || ""} onChange={(e) => setSelected({ ...selected, hip: Number(e.target.value) })} />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="skill" className="space-y-4">
                        <div>
                          <Label>マッサージ技術</Label>
                          <Textarea value={selected.massage_skills || ""} onChange={(e) => setSelected({ ...selected, massage_skills: e.target.value })} rows={4} />
                        </div>
                        <div>
                          <Label>講習回数</Label>
                          <Input type="number" value={selected.training_count || ""} onChange={(e) => setSelected({ ...selected, training_count: Number(e.target.value) })} />
                        </div>
                      </TabsContent>
                    </Tabs>

                    <Button className="mt-4 w-full" onClick={handleSave}>保存</Button>
                  </CardContent>
                </Card>
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
