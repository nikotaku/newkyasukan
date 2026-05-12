import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";

interface EquipmentItem {
  id: string;
  item_type: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string;
}

const ITEM_TYPES = [
  { key: "consumables", label: "消耗品" },
  { key: "costumes", label: "衣装" },
  { key: "furniture", label: "家具家電" },
];

export default function FacilitiesEquipment() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", quantity: 1, unit: "個", notes: "" });
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
      setItems(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (itemType: string) => {
    try {
      const { error } = await supabase.from("facility_equipment").insert([{ ...formData, item_type: itemType }]);
      if (error) throw error;
      setFormData({ name: "", quantity: 1, unit: "個", notes: "" });
      setShowForm(null);
      fetchItems();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("facility_equipment").delete().eq("id", id);
      if (error) throw error;
      fetchItems();
    } catch (error) {
      console.error("Error:", error);
    }
  };

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
              return (
                <TabsContent key={key} value={key}>
                  <div className="mb-4 flex justify-end">
                    <Button onClick={() => setShowForm(showForm === key ? null : key)}>
                      <Plus size={14} className="mr-2" />{label}を追加
                    </Button>
                  </div>

                  {showForm === key && (
                    <Card className="mb-4">
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>名称</Label>
                            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                          </div>
                          <div>
                            <Label>数量</Label>
                            <Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleAdd(key)}>追加</Button>
                          <Button variant="outline" onClick={() => setShowForm(null)}>キャンセル</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {loading ? (
                    <div className="text-center text-muted-foreground">読み込み中...</div>
                  ) : typeItems.length === 0 ? (
                    <Card><CardContent className="pt-10 pb-10 text-center text-muted-foreground">データがありません</CardContent></Card>
                  ) : (
                    <div className="space-y-2">
                      {typeItems.map((item) => (
                        <Card key={item.id}>
                          <CardContent className="pt-3 pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-sm">{item.name}</span>
                                <span className="ml-3 text-sm text-muted-foreground">{item.quantity}{item.unit}</span>
                                {item.notes && <span className="ml-3 text-xs text-muted-foreground">{item.notes}</span>}
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                                <Trash2 size={14} />
                              </Button>
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
