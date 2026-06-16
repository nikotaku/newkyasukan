import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Pencil, X, ImagePlus, Loader2, ExternalLink, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

interface PurchaseOrder {
  id: string;
  product_name: string;
  unit_price: number | null;
  order_url: string | null;
  supplier: string | null;
  last_ordered_at: string | null;
  payment_method: string | null;
  image_url: string | null;
  notes: string | null;
}

const emptyForm = (): Omit<PurchaseOrder, "id"> => ({
  product_name: "",
  unit_price: null,
  order_url: "",
  supplier: "",
  last_ordered_at: null,
  payment_method: "",
  image_url: null,
  notes: "",
});

const PAYMENT_METHODS = ["現金", "クレジットカード", "銀行振込", "PayPay", "Amazon Pay", "その他"];

export default function PurchaseOrders() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [search, setSearch] = useState("");

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchItems();
  }, [user]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("product_name");
      if (error) throw error;
      setItems((data || []) as PurchaseOrder[]);
    } catch (e) {
      console.error(e);
      toast.error("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setFormData(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (item: PurchaseOrder) => {
    setEditingId(item.id);
    setFormData({
      product_name: item.product_name,
      unit_price: item.unit_price,
      order_url: item.order_url || "",
      supplier: item.supplier || "",
      last_ordered_at: item.last_ordered_at || null,
      payment_method: item.payment_method || "",
      image_url: item.image_url,
      notes: item.notes || "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormData(emptyForm());
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadingImage(true);
    const ext = file.name.split(".").pop();
    const path = `purchase-orders/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("facility-manuals").upload(path, file);
    if (error) {
      toast.error("画像のアップロードに失敗しました");
      setUploadingImage(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("facility-manuals").getPublicUrl(path);
    setFormData((f) => ({ ...f, image_url: publicUrl }));
    setUploadingImage(false);
  };

  const handleSave = async () => {
    if (!formData.product_name.trim()) {
      toast.error("商品名を入力してください");
      return;
    }
    setSaving(true);
    const payload = {
      product_name: formData.product_name.trim(),
      unit_price: formData.unit_price,
      order_url: formData.order_url?.trim() || null,
      supplier: formData.supplier?.trim() || null,
      last_ordered_at: formData.last_ordered_at || null,
      payment_method: formData.payment_method?.trim() || null,
      image_url: formData.image_url || null,
      notes: formData.notes?.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("purchase_orders").update(payload).eq("id", editingId)
      : await supabase.from("purchase_orders").insert([payload]);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("保存に失敗しました");
      return;
    }
    toast.success(editingId ? "更新しました" : "追加しました");
    closeForm();
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) { toast.error("削除に失敗しました"); return; }
    toast.success("削除しました");
    fetchItems();
  };

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.product_name.toLowerCase().includes(q) ||
      (item.supplier || "").toLowerCase().includes(q) ||
      (item.payment_method || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">発注リスト</h1>
              <p className="text-xs text-muted-foreground mt-1">消耗品・備品の発注先と最終発注日を管理</p>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus size={14} className="mr-1" />追加
            </Button>
          </div>

          {/* 検索 */}
          <div className="mb-4">
            <Input
              placeholder="商品名・注文先・支払い方法で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {/* フォーム */}
          {formOpen && (
            <Card className="mb-5 border-primary/30">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-sm">{editingId ? "編集" : "新規追加"}</p>
                  <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                    <X size={16} />
                  </button>
                </div>

                {/* 画像 */}
                <div className="flex items-start gap-4">
                  {formData.image_url ? (
                    <div className="relative flex-shrink-0">
                      <img src={formData.image_url} alt="商品" className="w-24 h-24 object-cover rounded-lg border" />
                      <button
                        onClick={() => setFormData((f) => ({ ...f, image_url: null }))}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex-shrink-0 w-24 h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                      {uploadingImage ? (
                        <Loader2 size={20} className="animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <ImagePlus size={20} className="text-muted-foreground mb-1" />
                          <span className="text-[10px] text-muted-foreground">画像を追加</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e.target.files)}
                        disabled={uploadingImage}
                      />
                    </label>
                  )}

                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <Label>商品名 *</Label>
                      <Input
                        value={formData.product_name}
                        onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                        placeholder="例: アロマオイル 200ml"
                      />
                    </div>
                    <div>
                      <Label>単価（円）</Label>
                      <Input
                        type="number"
                        value={formData.unit_price ?? ""}
                        onChange={(e) => setFormData({ ...formData, unit_price: e.target.value ? Number(e.target.value) : null })}
                        placeholder="例: 1500"
                      />
                    </div>
                    <div>
                      <Label>注文先</Label>
                      <Input
                        value={formData.supplier || ""}
                        onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                        placeholder="例: Amazon"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>注文リンク</Label>
                    <Input
                      value={formData.order_url || ""}
                      onChange={(e) => setFormData({ ...formData, order_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label>最終発注日</Label>
                    <Input
                      type="date"
                      value={formData.last_ordered_at || ""}
                      onChange={(e) => setFormData({ ...formData, last_ordered_at: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label>支払い方法</Label>
                    <div className="flex gap-2">
                      <Input
                        value={formData.payment_method || ""}
                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                        placeholder="例: クレジットカード"
                        list="payment-methods-list"
                      />
                      <datalist id="payment-methods-list">
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m} />)}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <Label>メモ</Label>
                    <Input
                      value={formData.notes || ""}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="備考など"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={closeForm}>キャンセル</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                    {editingId ? "更新" : "保存"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* リスト */}
          {loading ? (
            <div className="text-center text-muted-foreground py-16">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? "一致する商品がありません" : "発注アイテムがありません"}</p>
              {!search && (
                <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
                  <Plus size={13} className="mr-1" />最初のアイテムを追加
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex gap-0">
                      {/* 画像 */}
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-24 h-full min-h-[96px] object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-24 min-h-[96px] bg-muted/30 flex items-center justify-center flex-shrink-0">
                          <ShoppingCart size={22} className="text-muted-foreground/40" />
                        </div>
                      )}

                      {/* 内容 */}
                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <p className="font-semibold text-sm leading-tight truncate pr-1">{item.product_name}</p>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => openEdit(item)}
                              className="p-1 text-muted-foreground hover:text-foreground rounded"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1 text-muted-foreground hover:text-destructive rounded"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          {item.unit_price != null && (
                            <p className="text-foreground font-medium">¥{item.unit_price.toLocaleString()}</p>
                          )}
                          {item.supplier && <p>注文先: {item.supplier}</p>}
                          {item.payment_method && <p>支払: {item.payment_method}</p>}
                          {item.last_ordered_at && (
                            <p>最終発注: {format(parseISO(item.last_ordered_at), "yyyy年M月d日", { locale: ja })}</p>
                          )}
                          {item.notes && <p className="truncate text-muted-foreground/70">{item.notes}</p>}
                        </div>

                        {item.order_url && (
                          <a
                            href={item.order_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary hover:underline"
                          >
                            <ExternalLink size={10} />注文ページを開く
                          </a>
                        )}
                      </div>
                    </div>
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
