import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, Save } from "lucide-react";
import { toast } from "sonner";

interface Cast {
  id: string;
  name: string;
}

interface TherapistProfile {
  id?: string;
  cast_id: string;
  // エステ魂掲載項目
  age: number | null;
  height: number | null;
  bust: number | null;
  waist: number | null;
  hip: number | null;
  weight: number | null;
  birthplace: string;
  blood_type: string;
  hobbies: string;
  special_skills: string;
  preferred_type: string;
  self_introduction: string;
  comment: string;
  // 内部管理項目
  mbti: string;
  career_history: string;
  massage_skills: string;
  training_count: number | null;
}

const emptyProfile = (cast_id: string): TherapistProfile => ({
  cast_id,
  age: null,
  height: null,
  bust: null,
  waist: null,
  hip: null,
  weight: null,
  birthplace: "",
  blood_type: "",
  hobbies: "",
  special_skills: "",
  preferred_type: "",
  self_introduction: "",
  comment: "",
  mbti: "",
  career_history: "",
  massage_skills: "",
  training_count: null,
});

export default function TherapistDatabase() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null);
  const [profile, setProfile] = useState<TherapistProfile | null>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchCasts();
  }, [user]);

  const fetchCasts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("casts")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setCasts(data || []);
    } catch (error) {
      console.error("Error fetching casts:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (cast: Cast) => {
    setSelectedCast(cast);
    setProfile(null);
    try {
      const { data, error } = await supabase
        .from("therapist_profiles" as any)
        .select("*")
        .eq("cast_id", cast.id)
        .maybeSingle();
      if (error) throw error;
      setProfile(data ? { ...emptyProfile(cast.id), ...data } : emptyProfile(cast.id));
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(emptyProfile(cast.id));
    }
  };

  const handleSave = async () => {
    if (!profile || !selectedCast) return;
    setSaving(true);
    try {
      const payload = {
        ...profile,
        cast_id: selectedCast.id,
        age: profile.age || null,
        height: profile.height || null,
        bust: profile.bust || null,
        waist: profile.waist || null,
        hip: profile.hip || null,
        weight: profile.weight || null,
        training_count: profile.training_count || null,
        blood_type: profile.blood_type || null,
      };
      const { error } = profile.id
        ? await supabase.from("therapist_profiles" as any).update(payload).eq("id", profile.id)
        : await supabase.from("therapist_profiles" as any).insert([payload]);
      if (error) throw error;
      toast.success("保存しました");
      await fetchProfile(selectedCast);
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(`保存に失敗しました: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof TherapistProfile, value: any) =>
    setProfile((p) => p ? { ...p, [field]: value } : p);

  const numInput = (field: keyof TherapistProfile, label: string, unit = "cm") => (
    <div>
      <Label>{label} ({unit})</Label>
      <Input
        type="number"
        value={(profile as any)?.[field] ?? ""}
        onChange={(e) => set(field, e.target.value ? Number(e.target.value) : null)}
      />
    </div>
  );

  const textInput = (field: keyof TherapistProfile, label: string, placeholder = "") => (
    <div>
      <Label>{label}</Label>
      <Input
        value={(profile as any)?.[field] ?? ""}
        onChange={(e) => set(field, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  const textareaInput = (field: keyof TherapistProfile, label: string, rows = 3) => (
    <div>
      <Label>{label}</Label>
      <Textarea
        value={(profile as any)?.[field] ?? ""}
        onChange={(e) => set(field, e.target.value)}
        rows={rows}
      />
    </div>
  );

  const filtered = casts.filter((c) => c.name.includes(searchQuery));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">セラピストデータベース</h1>
            <p className="text-muted-foreground text-sm">エステ魂掲載項目と内部管理情報</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cast list */}
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
                <div className="space-y-1">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => fetchProfile(c)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedCast?.id === c.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Profile editor */}
            <div className="lg:col-span-2">
              {selectedCast && profile ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between">
                      <span>{selectedCast.name}</span>
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        <Save size={14} className="mr-1" />
                        {saving ? "保存中..." : "保存"}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="estama">
                      <TabsList className="mb-4">
                        <TabsTrigger value="estama">エステ魂掲載</TabsTrigger>
                        <TabsTrigger value="internal">内部管理</TabsTrigger>
                      </TabsList>

                      {/* エステ魂掲載項目 */}
                      <TabsContent value="estama" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          {numInput("age", "年齢", "歳")}
                          <div>
                            <Label>血液型</Label>
                            <Select
                              value={profile.blood_type || ""}
                              onValueChange={(v) => set("blood_type", v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="選択" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="A">A型</SelectItem>
                                <SelectItem value="B">B型</SelectItem>
                                <SelectItem value="O">O型</SelectItem>
                                <SelectItem value="AB">AB型</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          {numInput("height", "身長")}
                          {numInput("bust", "バスト")}
                          {numInput("waist", "ウエスト")}
                          {numInput("hip", "ヒップ")}
                        </div>

                        {textInput("birthplace", "出身地", "例: 東京都")}
                        {textInput("hobbies", "趣味", "例: 映画鑑賞、料理")}
                        {textInput("special_skills", "特技", "例: ピアノ、水泳")}
                        {textInput("preferred_type", "好きなタイプ", "例: 優しい方、紳士な方")}
                        {textareaInput("self_introduction", "自己PR", 4)}
                        {textareaInput("comment", "コメント", 3)}
                      </TabsContent>

                      {/* 内部管理項目 */}
                      <TabsContent value="internal" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          {numInput("weight", "体重", "kg")}
                          {textInput("mbti", "MBTI", "例: INFP")}
                        </div>
                        {textareaInput("career_history", "過去の経歴", 3)}
                        {textareaInput("massage_skills", "マッサージ技術メモ", 3)}
                        <div>
                          <Label>講習回数</Label>
                          <Input
                            type="number"
                            value={profile.training_count ?? ""}
                            onChange={(e) => set("training_count", e.target.value ? Number(e.target.value) : null)}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
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
