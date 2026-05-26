import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface BackRate {
  id: string;
  course_type: string;
  duration: number;
  customer_price: number;
  therapist_back?: number;
  shop_back?: number;
}

export default function SystemCourses() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rates, setRates] = useState<BackRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    course_type: "",
    duration: 60,
    customer_price: 0,
    therapist_back: 0,
    shop_back: 0,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchRates();
  }, [user]);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("back_rates")
        .select("*")
        .order("course_type")
        .order("duration");
      if (error && error.code !== "PGRST116") throw error;
      setRates(data || []);
      const types = [...new Set((data || []).map((r: BackRate) => r.course_type))];
      setExpandedTypes(types);
    } catch (error) {
      console.error("Error fetching rates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.course_type.trim()) {
      toast.error("コース名を入力してください");
      return;
    }
    try {
      const { error } = await supabase.from("back_rates").insert([formData]);
      if (error) throw error;
      toast.success("追加しました");
      setFormData({ course_type: "", duration: 60, customer_price: 0, therapist_back: 0, shop_back: 0 });
      setShowForm(false);
      fetchRates();
    } catch (error) {
      console.error("Error adding rate:", error);
      toast.error("追加に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("back_rates").delete().eq("id", id);
      if (error) throw error;
      toast.success("削除しました");
      fetchRates();
    } catch (error) {
      console.error("Error deleting rate:", error);
      toast.error("削除に失敗しました");
    }
  };

  const handleUpdateRate = async (id: string, patch: Partial<BackRate>) => {
    setRates((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("back_rates").update(patch).eq("id", id);
    if (error) {
      toast.error("更新に失敗しました");
      fetchRates();
    }
  };

  const handleRenameType = async (oldType: string, newType: string) => {
    const trimmed = newType.trim();
    if (!trimmed || trimmed === oldType) return;
    setRates((prev) => prev.map((r) => (r.course_type === oldType ? { ...r, course_type: trimmed } : r)));
    const { error } = await supabase
      .from("back_rates")
      .update({ course_type: trimmed })
      .eq("course_type", oldType);
    if (error) {
      toast.error("コース名の更新に失敗しました");
      fetchRates();
    } else {
      toast.success("コース名を更新しました");
      setExpandedTypes((prev) => prev.map((t) => (t === oldType ? trimmed : t)));
    }
  };

  const toggleType = (type: string) => {
    setExpandedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const courseTypes = [...new Set(rates.map((r) => r.course_type))];

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">コース設定</h1>
              <p className="text-muted-foreground">
                フロントエンドの料金ページに反映されます
              </p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />
              追加
            </Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>コースを追加</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>コース名</Label>
                      <Input
                        value={formData.course_type}
                        onChange={(e) => setFormData({ ...formData, course_type: e.target.value })}
                        placeholder="例：アロマオイル、全力"
                        required
                      />
                    </div>
                    <div>
                      <Label>時間（分）</Label>
                      <Input
                        type="number"
                        min="10"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>お客様料金（円）</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.customer_price}
                        onChange={(e) => setFormData({ ...formData, customer_price: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>セラピスト報酬（円）</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.therapist_back}
                        onChange={(e) => setFormData({ ...formData, therapist_back: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>店舗取り分（円）</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.shop_back}
                        onChange={(e) => setFormData({ ...formData, shop_back: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">保存</Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                      キャンセル
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : rates.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                コースがありません
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {courseTypes.map((type) => {
                const typeRates = rates
                  .filter((r) => r.course_type === type)
                  .sort((a, b) => a.duration - b.duration);
                const isExpanded = expandedTypes.includes(type);
                return (
                  <Card key={type}>
                    <CardHeader className="select-none">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Input
                            defaultValue={type}
                            onBlur={(e) => handleRenameType(type, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="font-semibold max-w-[260px]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleType(type)}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <span>{typeRates.length}プラン</span>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-2">
                          <div className="grid grid-cols-[80px_1fr_1fr_1fr_40px] gap-2 text-xs text-muted-foreground px-1">
                            <span>時間</span>
                            <span>料金</span>
                            <span>セラピスト報酬</span>
                            <span>店舗取り分</span>
                            <span></span>
                          </div>
                          {typeRates.map((rate) => (
                            <div
                              key={rate.id}
                              className="grid grid-cols-[80px_1fr_1fr_1fr_40px] gap-2 items-center py-1"
                            >
                              <Input
                                type="number"
                                defaultValue={rate.duration}
                                onBlur={(e) => handleUpdateRate(rate.id, { duration: Number(e.target.value) || 0 })}
                              />
                              <Input
                                type="number"
                                defaultValue={rate.customer_price}
                                onBlur={(e) => handleUpdateRate(rate.id, { customer_price: Number(e.target.value) || 0 })}
                              />
                              <Input
                                type="number"
                                defaultValue={rate.therapist_back ?? 0}
                                onBlur={(e) => handleUpdateRate(rate.id, { therapist_back: Number(e.target.value) || 0 })}
                              />
                              <Input
                                type="number"
                                defaultValue={rate.shop_back ?? 0}
                                onBlur={(e) => handleUpdateRate(rate.id, { shop_back: Number(e.target.value) || 0 })}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(rate.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
