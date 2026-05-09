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
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchStoreInfo();
    }
  }, [user]);

  const fetchStoreInfo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_info")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setFormData(data);
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
      let result;
      if (formData.id) {
        result = await supabase
          .from("store_info")
          .update(formData)
          .eq("id", formData.id);
      } else {
        result = await supabase
          .from("store_info")
          .insert([formData]);
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">店舗情報</h1>
              <p className="text-muted-foreground">
                店舗の基本情報を設定
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>基本情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">店舗名</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          name: e.target.value,
                        })
                      }
                      placeholder="全力エステ 仙台"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">説明</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder="店舗の説明文"
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>連絡先</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="phone">電話番号</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phone: e.target.value,
                        })
                      }
                      placeholder="022-123-4567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          email: e.target.value,
                        })
                      }
                      placeholder="info@example.com"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>営業情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="hours">営業時間</Label>
                    <Input
                      id="hours"
                      value={formData.hours}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          hours: e.target.value,
                        })
                      }
                      placeholder="10:00 - 24:00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="holiday">定休日</Label>
                    <Input
                      id="holiday"
                      value={formData.holiday}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          holiday: e.target.value,
                        })
                      }
                      placeholder="不定休"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>所在地</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="address">住所</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          address: e.target.value,
                        })
                      }
                      placeholder="宮城県仙台市青葉区..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="lat">緯度</Label>
                      <Input
                        id="lat"
                        type="number"
                        step="0.00001"
                        value={formData.lat || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lat: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        placeholder="38.2682"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lng">経度</Label>
                      <Input
                        id="lng"
                        type="number"
                        step="0.00001"
                        value={formData.lng || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lng: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        placeholder="140.8729"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
