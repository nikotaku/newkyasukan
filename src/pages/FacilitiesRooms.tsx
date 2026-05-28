import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Plus, MapPin, KeyRound, DoorOpen, Save } from "lucide-react";

interface Room {
  id: string;
  name: string;
  room_type: string | null;
  address: string | null;
  entry_flow: string | null;
  key_number: string | null;
  key_info: string | null;
}

interface EquipmentItem {
  id: string;
  room_id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

interface SupplyItem {
  id: string;
  room_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

export default function FacilitiesRooms() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [newEquip, setNewEquip] = useState({ name: "", quantity: "1", notes: "" });
  const [newSupply, setNewSupply] = useState({ name: "", quantity: "0", unit: "", notes: "" });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchRooms();
  }, [user]);

  useEffect(() => {
    if (selectedId) {
      const room = rooms.find((r) => r.id === selectedId) || null;
      setDraft(room ? { ...room } : null);
      fetchEquipment(selectedId);
      fetchSupplies(selectedId);
    } else {
      setDraft(null);
      setEquipment([]);
      setSupplies([]);
    }
  }, [selectedId, rooms]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rooms" as any)
        .select("id,name,room_type,address,entry_flow,key_number,key_info")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      const list = (data || []) as unknown as Room[];
      setRooms(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      toast.error("ルームの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipment = async (roomId: string) => {
    const { data } = await supabase
      .from("room_equipment" as any)
      .select("id,room_id,name,quantity,notes")
      .eq("room_id", roomId)
      .order("created_at");
    setEquipment((data || []) as unknown as EquipmentItem[]);
  };

  const fetchSupplies = async (roomId: string) => {
    const { data } = await supabase
      .from("room_supplies" as any)
      .select("id,room_id,name,quantity,unit,notes")
      .eq("room_id", roomId)
      .order("created_at");
    setSupplies((data || []) as unknown as SupplyItem[]);
  };

  const handleSaveRoom = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("rooms" as any)
        .update({
          address: draft.address,
          entry_flow: draft.entry_flow,
          key_number: draft.key_number,
          key_info: draft.key_info,
        })
        .eq("id", draft.id);
      if (error) throw error;
      toast.success("保存しました");
      fetchRooms();
    } catch (error) {
      console.error("Error saving room:", error);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const addEquipment = async () => {
    if (!selectedId || !newEquip.name.trim()) {
      toast.error("設備名を入力してください");
      return;
    }
    const { error } = await supabase.from("room_equipment" as any).insert({
      room_id: selectedId,
      name: newEquip.name.trim(),
      quantity: parseInt(newEquip.quantity, 10) || 1,
      notes: newEquip.notes.trim() || null,
    });
    if (error) {
      toast.error("追加に失敗しました");
      return;
    }
    setNewEquip({ name: "", quantity: "1", notes: "" });
    fetchEquipment(selectedId);
  };

  const deleteEquipment = async (id: string) => {
    const { error } = await supabase.from("room_equipment" as any).delete().eq("id", id);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    setEquipment((prev) => prev.filter((e) => e.id !== id));
  };

  const addSupply = async () => {
    if (!selectedId || !newSupply.name.trim()) {
      toast.error("備品名を入力してください");
      return;
    }
    const { error } = await supabase.from("room_supplies" as any).insert({
      room_id: selectedId,
      name: newSupply.name.trim(),
      quantity: parseInt(newSupply.quantity, 10) || 0,
      unit: newSupply.unit.trim() || null,
      notes: newSupply.notes.trim() || null,
    });
    if (error) {
      toast.error("追加に失敗しました");
      return;
    }
    setNewSupply({ name: "", quantity: "0", unit: "", notes: "" });
    fetchSupplies(selectedId);
  };

  const deleteSupply = async (id: string) => {
    const { error } = await supabase.from("room_supplies" as any).delete().eq("id", id);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    setSupplies((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] px-4 md:px-6 pb-6">
        <div className="max-w-5xl mx-auto py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">ルーム管理</h1>
            <p className="text-muted-foreground text-sm">住所・入室方法・鍵番号・設備DB・備品DBの管理</p>
          </div>

          {/* ルーム選択 */}
          <div className="flex flex-wrap gap-2 mb-6">
            {loading ? (
              <span className="text-muted-foreground text-sm">読み込み中...</span>
            ) : rooms.length === 0 ? (
              <span className="text-muted-foreground text-sm">ルームが登録されていません</span>
            ) : (
              rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedId(room.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    selectedId === room.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                >
                  {room.name}
                </button>
              ))
            )}
          </div>

          {draft && (
            <div className="space-y-6">
              {/* 基本情報 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{draft.name} の基本情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="flex items-center gap-1.5"><MapPin size={14} />ルーム住所</Label>
                    <Input
                      className="mt-1"
                      value={draft.address || ""}
                      onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                      placeholder="例：仙台市青葉区二日町11-15 In-Towner 201号室"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><DoorOpen size={14} />入室方法</Label>
                    <Textarea
                      className="mt-1"
                      rows={4}
                      value={draft.entry_flow || ""}
                      onChange={(e) => setDraft({ ...draft, entry_flow: e.target.value })}
                      placeholder="入室手順・オートロック解除・エレベーターなど"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-1.5"><KeyRound size={14} />鍵の番号</Label>
                      <Input
                        className="mt-1"
                        value={draft.key_number || ""}
                        onChange={(e) => setDraft({ ...draft, key_number: e.target.value })}
                        placeholder="例：1234"
                      />
                    </div>
                    <div>
                      <Label>鍵の補足メモ</Label>
                      <Input
                        className="mt-1"
                        value={draft.key_info || ""}
                        onChange={(e) => setDraft({ ...draft, key_info: e.target.value })}
                        placeholder="鍵の種類・保管場所など"
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveRoom} disabled={saving} className="gap-1.5">
                    <Save size={15} />{saving ? "保存中..." : "基本情報を保存"}
                  </Button>
                </CardContent>
              </Card>

              {/* 設備DB */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">設備DB</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {equipment.length === 0 ? (
                      <p className="text-sm text-muted-foreground">登録された設備はありません</p>
                    ) : (
                      equipment.map((e) => (
                        <div key={e.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                          <span className="font-medium flex-1">{e.name}</span>
                          <span className="text-muted-foreground">×{e.quantity}</span>
                          {e.notes && <span className="text-muted-foreground text-xs">{e.notes}</span>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" onClick={() => deleteEquipment(e.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs">設備名</Label>
                      <Input className="mt-1 h-8" value={newEquip.name} onChange={(e) => setNewEquip({ ...newEquip, name: e.target.value })} placeholder="例：ベッド" />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs">数量</Label>
                      <Input className="mt-1 h-8" type="number" value={newEquip.quantity} onChange={(e) => setNewEquip({ ...newEquip, quantity: e.target.value })} />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs">メモ</Label>
                      <Input className="mt-1 h-8" value={newEquip.notes} onChange={(e) => setNewEquip({ ...newEquip, notes: e.target.value })} placeholder="任意" />
                    </div>
                    <Button size="sm" className="h-8 gap-1" onClick={addEquipment}><Plus size={14} />追加</Button>
                  </div>
                </CardContent>
              </Card>

              {/* 備品DB */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">備品DB</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {supplies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">登録された備品はありません</p>
                    ) : (
                      supplies.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                          <span className="font-medium flex-1">{s.name}</span>
                          <span className="text-muted-foreground">{s.quantity}{s.unit || "個"}</span>
                          {s.notes && <span className="text-muted-foreground text-xs">{s.notes}</span>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" onClick={() => deleteSupply(s.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs">備品名</Label>
                      <Input className="mt-1 h-8" value={newSupply.name} onChange={(e) => setNewSupply({ ...newSupply, name: e.target.value })} placeholder="例：タオル" />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs">数量</Label>
                      <Input className="mt-1 h-8" type="number" value={newSupply.quantity} onChange={(e) => setNewSupply({ ...newSupply, quantity: e.target.value })} />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs">単位</Label>
                      <Input className="mt-1 h-8" value={newSupply.unit} onChange={(e) => setNewSupply({ ...newSupply, unit: e.target.value })} placeholder="枚" />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs">メモ</Label>
                      <Input className="mt-1 h-8" value={newSupply.notes} onChange={(e) => setNewSupply({ ...newSupply, notes: e.target.value })} placeholder="任意" />
                    </div>
                    <Button size="sm" className="h-8 gap-1" onClick={addSupply}><Plus size={14} />追加</Button>
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
