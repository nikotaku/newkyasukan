import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Pencil, X, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EquipmentItem {
  id: string;
  item_type: string;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  manual_images: string[];
}

interface CustomField {
  key: string;
  value: string;
}

const ITEM_TYPES = [
  { key: "consumables", label: "消耗品" },
  { key: "costumes", label: "衣装" },
  { key: "furniture", label: "家具家電" },
];

const emptyForm = () => ({ name: "", quantity: 1, unit: "個", notes: "", customFields: [] as CustomField[], manualImages: [] as string[] });

export default function FacilitiesEquipment() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("type") || "consumables";

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
      const { data, error } = await supabase.from("facility_equipment").select("*").order("name");
      if (error && error.code !== "PGRST116") throw error;
      setItems((data || []) as EquipmentItem[]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = (itemType: string) => {
    setEditingId(null);
    setFormData(emptyForm());
    setFormType(itemType);
  };

  const openEdit = (item: EquipmentItem) => {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || "個",
      notes: item.notes || "",
      customFields: Object.entries(item.custom_fields || {}).map(([key, value]) => ({ key, value: String(value) })),
      manualImages: item.manual_images || [],
    });
    setFormType(item.item_type);
  };

  const closeForm = () => { setFormType(null); setEditingId(null); setFormData(emptyForm()); };

  const addProperty = () => setFormData((f) => ({ ...f, customFields: [...f.customFields, { key: "", value: "" }] }));
  const updateProperty = (i: number, field: "key" | "value", val: string) =>
    setFormData((f) => ({ ...f, customFields: f.customFields.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)) }));
  const removeProperty = (i: number) =>
    setFormData((f) => ({ ...f, customFields: f.customFields.filter((_, idx) => idx !== i) }));

  const handleManualImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `equipment/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("facility-manuals").upload(path, file);
      if (error) { toast.error(`アップロード失敗: ${file.name}`); continue; }
      const { data: { publicUrl } } = supabase.storage.from("facility-manuals").getPublicUrl(path);
      uploaded.push(publicUrl);
    }
    setFormData((f) => ({ ...f, manualImages: [...f.manualImages, ...uploaded] }));
    setUploadingImages(false);
  };

  const removeManualImage = (url: string) =>
    setFormData((f) => ({ ...f, manualImages: f.manualImages.filter((u) => u !== url) }));

  const handleSave = async (itemType: string) => {
    if (!formData.name.trim()) { toast.error("名称を入力してください"); return; }
    setSaving(true);
    const custom_fields = Object.fromEntries(
      formData.customFields.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value])
    );
    const payload = {
      item_type: itemType,
      name: formData.name.trim(),
      quantity: formData.quantity,
      unit: formData.unit || null,
      notes: formData.notes || null,
      custom_fields,
      manual_images: formData.manualImages,
    };
    const { error } = editingId
      ? await supabase.from("facility_equipment").update(payload).eq("id", editingId)
      : await supabase.from("facility_equipment").insert([payload]);
    setSaving(false);
    if (error) { console.error(error); toast.error("保存に失敗しました"); return; }
    toast.success(editingId ? "更新しました" : "追加しました");
    closeForm();
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await supabase.from("facility_equipment").delete().eq("id", id);
    if (error) { toast.error("削除に失敗しました"); return; }
    fetchItems();
  };

  const renderForm = (itemType: string) => (
    <Card className="mb-4">
      <CardContent className="pt-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>名称</Label>
            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div>
            <Label>数量</Label>
            <Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>単位</Label>
            <Input value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>メモ</Label>
          <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>カスタムプロパティ</Label>
            <Button type="button" size="sm" variant="outline" onClick={addProperty}>
              <Plus size={13} className="mr-1" />プロパティを追加
            </Button>
          </div>
          {formData.customFields.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input placeholder="項目名（例: 保管場所）" value={p.key} onChange={(e) => updateProperty(i, "key", e.target.value)} className="flex-1" />
              <Input placeholder="値" value={p.value} onChange={(e) => updateProperty(i, "value", e.target.value)} className="flex-1" />
              <Button type="button" size="sm" variant="ghost" onClick={() => removeProperty(i)}><X size={14} /></Button>
            </div>
          ))}
        </div>

        {/* マニュアル画像 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>使い方マニュアル画像</Label>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-md bg-background hover:bg-muted transition-colors">
                {uploadingImages ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                {uploadingImages ? "アップロード中..." : "画像を追加"}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploadingImages}
                onChange={(e) => handleManualImageUpload(e.target.files)}
              />
            </label>
          </div>
          {formData.manualImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.manualImages.map((url) => (
                <div key={url} className="relative group">
                  <img src={url} alt="マニュアル" className="w-24 h-24 object-cover rounded border" />
                  <button
                    type="button"
                    onClick={() => removeManualImage(url)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={() => handleSave(itemType)} disabled={saving || uploadingImages}>{saving ? "保存中..." : editingId ? "更新" : "追加"}</Button>
          <Button variant="outline" onClick={closeForm}>キャンセル</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">設備管理</h1>
            <p className="text-muted-foreground">消耗品・衣装・家具家電の管理</p>
          </div>

          <Tabs defaultValue={defaultTab}>
            <TabsList className="mb-6">
              {ITEM_TYPES.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
              ))}
            </TabsList>

            {ITEM_TYPES.map(({ key, label }) => {
              const typeItems = items.filter((i) => i.item_type === key);
              const formOpen = formType === key;
              return (
                <TabsContent key={key} value={key}>
                  <div className="mb-4 flex justify-end">
                    <Button onClick={() => (formOpen && !editingId ? closeForm() : openAdd(key))}>
                      <Plus size={14} className="mr-2" />{label}を追加
                    </Button>
                  </div>

                  {formOpen && renderForm(key)}

                  {loading ? (
                    <div className="text-center text-muted-foreground">読み込み中...</div>
                  ) : typeItems.length === 0 ? (
                    <Card><CardContent className="pt-10 pb-10 text-center text-muted-foreground">データがありません</CardContent></Card>
                  ) : (
                    <div className="space-y-2">
                      {typeItems.map((item) => (
                        <Card key={item.id}>
                          <CardContent className="pt-3 pb-3">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0">
                                <div>
                                  <span className="font-semibold text-sm">{item.name}</span>
                                  <span className="ml-3 text-sm text-muted-foreground">{item.quantity}{item.unit}</span>
                                  {item.notes && <span className="ml-3 text-xs text-muted-foreground">{item.notes}</span>}
                                </div>
                                {item.custom_fields && Object.keys(item.custom_fields).length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                    {Object.entries(item.custom_fields).map(([k, v]) => (
                                      <span key={k} className="text-xs text-muted-foreground">
                                        <span className="font-medium">{k}:</span> {String(v)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {item.manual_images && item.manual_images.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {item.manual_images.map((url) => (
                                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                        <img src={url} alt="マニュアル" className="w-16 h-16 object-cover rounded border hover:opacity-80 transition-opacity" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                                  <Pencil size={14} />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
