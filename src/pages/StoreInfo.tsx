import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Save } from "lucide-react";
import { toast } from "sonner";

interface StoreInfoData {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  holiday: string;
  lat: number | null;
  lng: number | null;
  twitter_url?: string;
  line_url?: string;
}

export default function StoreInfo() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<StoreInfoData>({
    id: "",
    name: "",
    description: "",
    address: "",
    phone: "",
    email: "",
    hours: "",
    holiday: "",
    lat: null,
    lng: null,
    twitter_url: "",
    line_url: "",
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchStoreInfo();
  }, [user]);

  const fetchStoreInfo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("store_info").select("*").single();
      if (error && error.code !== "PGRST116") throw error;
      if (data) {
        setFormData({
          ...data,
          twitter_url: (data as any).twitter_url || "",
          line_url: (data as any).line_url || "",
        });
      }
    } catch (error) {
      console.error("Error fetching store info:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("店舗名を入力してください");
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...formData };
      let result;
      if (formData.id) {
        result = await supabase.from("store_info").update(payload).eq("id", formData.id);
      } else {
        result = await supabase.from("store_info").insert([payload]);
      }
      if (result.error) throw result.error;
      toast.success("店舗情報を保存しました");
      fetchStoreInfo();
    } catch (error) {
      console.error("Error saving store info:", error);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof StoreInfoData, value: any) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">店舗情報</h1>
              <p className="text-muted-foreground">フロントエンドのアクセスページに反映されます</p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>店舗名</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="全力エステ 仙台"
                    />
                  </div>
                  <div>
                    <Label>コンセプト・説明</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => set("description", e.target.value)}
                      placeholder="店舗のコンセプトや説明文"
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>連絡先</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>電話番号</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="07090941854"
                    />
                  </div>
                  <div>
                    <Label>メールアドレス</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="info@example.com"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>営業情報</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>営業時間</Label>
                    <Input
                      value={formData.hours}
                      onChange={(e) => set("hours", e.target.value)}
                      placeholder="12:00〜26:00（24:40最終受付）"
                    />
                  </div>
                  <div>
                    <Label>定休日</Label>
                    <Input
                      value={formData.holiday}
                      onChange={(e) => set("holiday", e.target.value)}
                      placeholder="年中無休"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>所在地</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>住所</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => set("address", e.target.value)}
                      placeholder="宮城県仙台市青葉区（出張専門）"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>緯度</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={formData.lat || ""}
                        onChange={(e) => set("lat", e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="38.2682"
                      />
                    </div>
                    <div>
                      <Label>経度</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={formData.lng || ""}
                        onChange={(e) => set("lng", e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="140.8729"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>SNSリンク</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>X（Twitter）URL</Label>
                    <Input
                      value={formData.twitter_url || ""}
                      onChange={(e) => set("twitter_url", e.target.value)}
                      placeholder="https://twitter.com/zr_news1"
                    />
                  </div>
                  <div>
                    <Label>LINE URL</Label>
                    <Input
                      value={formData.line_url || ""}
                      onChange={(e) => set("line_url", e.target.value)}
                      placeholder="https://lin.ee/RdRhmXw"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ※ SNSリンクはフロントエンドのアクセスページのボタンに反映されます
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
