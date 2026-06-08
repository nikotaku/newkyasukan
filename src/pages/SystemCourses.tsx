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
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface BackRate {
  id: string;
  course_type: string;
  duration: number;
  customer_price: number;
  therapist_back?: number;
  shop_back?: number;
  display_order?: number;
  is_visible?: boolean;
  description?: string;
}

export default function SystemCourses() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rates, setRates] = useState<BackRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ duration: 0, customer_price: 0, therapist_back: 0, shop_back: 0, description: "" });
  const [renamingType, setRenamingType] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [formData, setFormData] = useState({
    course_type: "",
    duration: 60,
    customer_price: 0,
    therapist_back: 0,
    shop_back: 0,
    description: "",
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
        .order("display_order", { ascending: true })
        .order("course_type")
        .order("duration");
      if (error && error.code !== "PGRST116") throw error;
      setRates(data || []);
      const types = [...new Set((data || []).map((r: BackRate) => r.course_type))];
      setExpandedTypes((prev) => (prev.length === 0 ? types : prev));
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
      const nextOrder = rates.length > 0 ? Math.max(...rates.map((r) => r.display_order ?? 0)) + 1 : 0;
      const { error } = await supabase.from("back_rates").insert([{ ...formData, display_order: nextOrder }]);
      if (error) throw error;
      toast.success("追加しました");
      setFormData({ course_type: "", duration: 60, customer_price: 0, therapist_back: 0, shop_back: 0, description: "" });
      setShowForm(false);
      fetchRates();
    } catch (error) {
      console.error("Error adding rate:", error);
      toast.error("追加に失敗しました");
    }
  };

  const startEdit = (rate: BackRate) => {
    setEditingId(rate.id);
    setEditData({
      duration: rate.duration,
      customer_price: rate.customer_price,
      therapist_back: rate.therapist_back ?? 0,
      shop_back: rate.shop_back ?? 0,
      description: rate.description ?? "",
    });
  };

  const handleUpdate = async (id: string) => {
    try {
      const { error } = await supabase
        .from("back_rates")
        .update({
          duration: editData.duration,
          customer_price: editData.customer_price,
          therapist_back: editData.therapist_back,
          shop_back: editData.shop_back,
          description: editData.description || null,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("更新しました");
      setEditingId(null);
      fetchRates();
    } catch (error) {
      console.error("Error updating rate:", error);
      toast.error("更新に失敗しました");
    }
  };

  const toggleVisible = async (rate: BackRate) => {
    const next = !(rate.is_visible ?? true);
    setRates((prev) => prev.map((r) => (r.id === rate.id ? { ...r, is_visible: next } : r)));
    const { error } = await supabase.from("back_rates").update({ is_visible: next }).eq("id", rate.id);
    if (error) {
      toast.error("表示設定の変更に失敗しました");
      fetchRates();
    } else {
      toast.success(next ? "フロントに表示します" : "フロント非表示にしました");
    }
  };

  // グループ（コースタイプ）単位で一括表示/非表示
  const toggleGroupVisible = async (type: string, visible: boolean) => {
    setRates((prev) => prev.map((r) => (r.course_type === type ? { ...r, is_visible: visible } : r)));
    const { error } = await supabase.from("back_rates").update({ is_visible: visible }).eq("course_type", type);
    if (error) {
      toast.error("表示設定の変更に失敗しました");
      fetchRates();
    } else {
      toast.success(visible ? "コースをフロントに表示します" : "コースをフロント非表示にしました");
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

  // コース名（course_type）のリネーム：同一タイプの全行を更新
  const handleRenameType = async (oldType: string) => {
    const newType = renameValue.trim();
    if (!newType) {
      toast.error("コース名を入力してください");
      return;
    }
    if (newType === oldType) {
      setRenamingType(null);
      return;
    }
    try {
      const { error } = await supabase.from("back_rates").update({ course_type: newType }).eq("course_type", oldType);
      if (error) throw error;
      toast.success("コース名を変更しました");
      setRenamingType(null);
      setExpandedTypes((prev) => prev.map((t) => (t === oldType ? newType : t)));
      fetchRates();
    } catch (error) {
      console.error("Error renaming course type:", error);
      toast.error("変更に失敗しました");
    }
  };

  const toggleType = (type: string) => {
    setExpandedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // display_order 順でグループ（コースタイプ）の並びを決定
  const courseTypes = [...new Set(rates.map((r) => r.course_type))];

  // 指定IDリストの順序で display_order を一括保存
  const persistOrder = async (orderedIds: string[]) => {
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from("back_rates").update({ display_order: i }).eq("id", id)
      )
    );
  };

  // グループ内のプラン並べ替え
  const handleMovePlan = async (type: string, index: number, dir: -1 | 1) => {
    const typeRates = rates.filter((r) => r.course_type === type);
    const target = index + dir;
    if (target < 0 || target >= typeRates.length) return;
    const reordered = [...typeRates];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // 全体のIDリストを、このグループだけ並べ替えて再構築
    const newRates: BackRate[] = [];
    courseTypes.forEach((t) => {
      if (t === type) newRates.push(...reordered);
      else newRates.push(...rates.filter((r) => r.course_type === t));
    });
    setRates(newRates);
    try {
      await persistOrder(newRates.map((r) => r.id));
    } catch (error) {
      console.error("Error reordering plans:", error);
      toast.error("並べ替えに失敗しました");
      fetchRates();
    }
  };

  // コースタイプ（グループ）の並べ替え
  const handleMoveGroup = async (groupIndex: number, dir: -1 | 1) => {
    const target = groupIndex + dir;
    if (target < 0 || target >= courseTypes.length) return;
    const newOrder = [...courseTypes];
    [newOrder[groupIndex], newOrder[target]] = [newOrder[target], newOrder[groupIndex]];
    const newRates: BackRate[] = [];
    newOrder.forEach((t) => newRates.push(...rates.filter((r) => r.course_type === t)));
    setRates(newRates);
    try {
      await persistOrder(newRates.map((r) => r.id));
    } catch (error) {
      console.error("Error reordering groups:", error);
      toast.error("並べ替えに失敗しました");
      fetchRates();
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
                    <div className="md:col-span-2">
                      <Label>説明文（任意）</Label>
                      <textarea
                        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={2}
                        placeholder="コースの説明や特徴など"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
              {courseTypes.map((type, groupIndex) => {
                const typeRates = rates.filter((r) => r.course_type === type);
                const isExpanded = expandedTypes.includes(type);
                return (
                  <Card key={type}>
                    <CardHeader className="select-none">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* グループ並べ替え */}
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleMoveGroup(groupIndex, -1)}
                              disabled={groupIndex === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => handleMoveGroup(groupIndex, 1)}
                              disabled={groupIndex === courseTypes.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          {renamingType === type ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="h-8 w-40"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={() => handleRenameType(type)}>
                                <Check size={14} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRenamingType(null)}>
                                <X size={14} />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <CardTitle
                                className="text-base cursor-pointer"
                                onClick={() => toggleType(type)}
                              >
                                {type}コース
                              </CardTitle>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setRenamingType(type); setRenameValue(type); }}
                              >
                                <Pencil size={12} />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const allVisible = typeRates.every((r) => r.is_visible ?? true);
                            return (
                              <Button
                                size="sm"
                                variant="ghost"
                                className={allVisible ? "text-emerald-600" : "text-muted-foreground"}
                                onClick={(e) => { e.stopPropagation(); toggleGroupVisible(type, !allVisible); }}
                                title={allVisible ? "コースをフロント非表示にする" : "コースをフロント表示にする"}
                              >
                                {allVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                                <span className="ml-1 text-xs">{allVisible ? "表示中" : "非表示"}</span>
                              </Button>
                            );
                          })()}
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleType(type)}>
                            <span className="text-sm text-muted-foreground">
                              {typeRates.length}プラン
                            </span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-2">
                          {typeRates.map((rate, index) => (
                            <div
                              key={rate.id}
                              className={`py-2 border-b border-border last:border-0 ${(rate.is_visible ?? true) ? "" : "opacity-50"}`}
                            >
                              {editingId === rate.id ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div>
                                      <Label className="text-xs">時間（分）</Label>
                                      <Input
                                        type="number"
                                        min="10"
                                        value={editData.duration}
                                        onChange={(e) => setEditData({ ...editData, duration: Number(e.target.value) || 0 })}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">お客様料金</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editData.customer_price}
                                        onChange={(e) => setEditData({ ...editData, customer_price: Number(e.target.value) || 0 })}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">セラピスト報酬</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editData.therapist_back}
                                        onChange={(e) => setEditData({ ...editData, therapist_back: Number(e.target.value) || 0 })}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">店舗取り分</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editData.shop_back}
                                        onChange={(e) => setEditData({ ...editData, shop_back: Number(e.target.value) || 0 })}
                                      />
                                    </div>
                                    <div className="col-span-2 md:col-span-4">
                                      <Label className="text-xs">説明文</Label>
                                      <textarea
                                        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                        rows={2}
                                        placeholder="コースの説明や特徴など"
                                        value={editData.description}
                                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleUpdate(rate.id)}>
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
                                    {/* プラン並べ替え */}
                                    <div className="flex flex-col">
                                      <button
                                        onClick={() => handleMovePlan(type, index, -1)}
                                        disabled={index === 0}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                                      >
                                        <ChevronUp size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleMovePlan(type, index, 1)}
                                        disabled={index === typeRates.length - 1}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                                      >
                                        <ChevronDown size={14} />
                                      </button>
                                    </div>
                                    <div>
                                      <div className="flex gap-6 text-sm">
                                        <span className="font-medium">{rate.duration}分</span>
                                        <span>¥{rate.customer_price.toLocaleString()}</span>
                                        {rate.therapist_back !== undefined && rate.therapist_back > 0 && (
                                          <span className="text-muted-foreground">
                                            バック ¥{rate.therapist_back.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                      {rate.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{rate.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 items-center">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className={(rate.is_visible ?? true) ? "text-emerald-600" : "text-muted-foreground"}
                                      onClick={() => toggleVisible(rate)}
                                      title={(rate.is_visible ?? true) ? "フロント非表示にする" : "フロント表示にする"}
                                    >
                                      {(rate.is_visible ?? true) ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => startEdit(rate)}>
                                      <Pencil size={14} />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(rate.id)}>
                                      <Trash2 size={14} />
                                    </Button>
                                  </div>
                                </div>
                              )}
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
