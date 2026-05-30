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
import { Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface OptionRate {
  id: string;
  option_name: string;
  customer_price: number;
  therapist_back?: number;
  extension_minutes?: number;
  display_order?: number;
  is_visible: boolean;
}

export default function SystemOptions() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [options, setOptions] = useState<OptionRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ option_name: "", customer_price: 0, therapist_back: 0, extension_minutes: 0 });
  const [formData, setFormData] = useState({
    option_name: "",
    customer_price: 0,
    therapist_back: 0,
    extension_minutes: 0,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchOptions();
  }, [user]);

  const fetchOptions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("option_rates")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error && error.code !== "PGRST116") throw error;
      setOptions(data || []);
    } catch (error) {
      console.error("Error fetching options:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.option_name.trim()) {
      toast.error("オプション名を入力してください");
      return;
    }
    try {
      const nextOrder = options.length > 0 ? Math.max(...options.map((o) => o.display_order ?? 0)) + 1 : 0;
      const payload: any = {
        option_name: formData.option_name,
        customer_price: formData.customer_price,
        display_order: nextOrder,
      };
      if (formData.therapist_back > 0) payload.therapist_back = formData.therapist_back;
      if (formData.extension_minutes > 0) payload.extension_minutes = formData.extension_minutes;

      const { error } = await supabase.from("option_rates").insert([payload]);
      if (error) throw error;
      toast.success("追加しました");
      setFormData({ option_name: "", customer_price: 0, therapist_back: 0, extension_minutes: 0 });
      setShowForm(false);
      fetchOptions();
    } catch (error) {
      console.error("Error adding option:", error);
      toast.error("追加に失敗しました");
    }
  };

  const startEdit = (opt: OptionRate) => {
    setEditingId(opt.id);
    setEditData({
      option_name: opt.option_name,
      customer_price: opt.customer_price,
      therapist_back: opt.therapist_back ?? 0,
      extension_minutes: opt.extension_minutes ?? 0,
    });
  };

  const handleUpdate = async (id: string) => {
    if (!editData.option_name.trim()) {
      toast.error("オプション名を入力してください");
      return;
    }
    try {
      const { error } = await supabase
        .from("option_rates")
        .update({
          option_name: editData.option_name,
          customer_price: editData.customer_price,
          therapist_back: editData.therapist_back,
          extension_minutes: editData.extension_minutes,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("更新しました");
      setEditingId(null);
      fetchOptions();
    } catch (error) {
      console.error("Error updating option:", error);
      toast.error("更新に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("option_rates").delete().eq("id", id);
      if (error) throw error;
      toast.success("削除しました");
      fetchOptions();
    } catch (error) {
      console.error("Error deleting option:", error);
      toast.error("削除に失敗しました");
    }
  };

  const handleToggleVisible = async (opt: OptionRate) => {
    try {
      const { error } = await supabase
        .from("option_rates")
        .update({ is_visible: !opt.is_visible })
        .eq("id", opt.id);
      if (error) throw error;
      setOptions(options.map((o) => o.id === opt.id ? { ...o, is_visible: !opt.is_visible } : o));
    } catch (error) {
      console.error("Error toggling visibility:", error);
      toast.error("更新に失敗しました");
    }
  };

  // 並べ替え：隣の要素と display_order を入れ替え
  const handleMove = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= options.length) return;
    const a = options[index];
    const b = options[target];
    const aOrder = a.display_order ?? index;
    const bOrder = b.display_order ?? target;
    // 楽観的更新
    const newList = [...options];
    newList[index] = { ...b };
    newList[target] = { ...a };
    setOptions(newList);
    try {
      await Promise.all([
        supabase.from("option_rates").update({ display_order: bOrder }).eq("id", a.id),
        supabase.from("option_rates").update({ display_order: aOrder }).eq("id", b.id),
      ]);
    } catch (error) {
      console.error("Error reordering:", error);
      toast.error("並べ替えに失敗しました");
      fetchOptions();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">オプション設定</h1>
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
                <CardTitle>オプションを追加</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>オプション名</Label>
                      <Input
                        value={formData.option_name}
                        onChange={(e) => setFormData({ ...formData, option_name: e.target.value })}
                        placeholder="例：個オプ、延長60分"
                        required
                      />
                    </div>
                    <div>
                      <Label>お客様料金（円）</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="0"
                        value={formData.customer_price === 0 ? "" : formData.customer_price}
                        onChange={(e) => setFormData({ ...formData, customer_price: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label>セラピスト報酬（円）</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="0"
                        value={formData.therapist_back === 0 ? "" : formData.therapist_back}
                        onChange={(e) => setFormData({ ...formData, therapist_back: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label>延長時間（分、0=なし）</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="0"
                        value={formData.extension_minutes === 0 ? "" : formData.extension_minutes}
                        onChange={(e) => setFormData({ ...formData, extension_minutes: Number(e.target.value) || 0 })}
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
          ) : options.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                オプションがありません
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {options.map((opt, index) => (
                <Card key={opt.id}>
                  <CardContent className="pt-4 pb-4">
                    {editingId === opt.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">オプション名</Label>
                            <Input
                              value={editData.option_name}
                              onChange={(e) => setEditData({ ...editData, option_name: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">お客様料金（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              value={editData.customer_price}
                              onChange={(e) => setEditData({ ...editData, customer_price: Number(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">セラピスト報酬（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              value={editData.therapist_back}
                              onChange={(e) => setEditData({ ...editData, therapist_back: Number(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">延長時間（分、0=なし）</Label>
                            <Input
                              type="number"
                              min="0"
                              value={editData.extension_minutes}
                              onChange={(e) => setEditData({ ...editData, extension_minutes: Number(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdate(opt.id)}>
                            <Check size={14} className="mr-1" />保存
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            <X size={14} className="mr-1" />キャンセル
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* 並べ替えボタン */}
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleMove(index, -1)}
                              disabled={index === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => handleMove(index, 1)}
                              disabled={index === options.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <div className="flex gap-6 text-sm">
                            <span className={`font-semibold ${!opt.is_visible ? "text-muted-foreground line-through" : ""}`}>
                              {opt.option_name}
                            </span>
                            <span className={!opt.is_visible ? "text-muted-foreground" : ""}>
                              ¥{opt.customer_price.toLocaleString()}
                            </span>
                            {opt.therapist_back !== undefined && opt.therapist_back > 0 && (
                              <span className="text-muted-foreground">
                                バック ¥{opt.therapist_back.toLocaleString()}
                              </span>
                            )}
                            {opt.extension_minutes !== undefined && opt.extension_minutes > 0 && (
                              <span className="text-muted-foreground">
                                延長 {opt.extension_minutes}分
                              </span>
                            )}
                            {!opt.is_visible && (
                              <span className="text-xs text-muted-foreground">(非表示)</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleVisible(opt)}
                            title={opt.is_visible ? "フロントに表示中（クリックで非表示）" : "非表示（クリックで表示）"}
                          >
                            {opt.is_visible ? <Eye size={14} className="text-green-500" /> : <EyeOff size={14} className="text-muted-foreground" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(opt)}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(opt.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
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
