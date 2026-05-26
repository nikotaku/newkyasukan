import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface Room {
  id: string;
  name: string;
  room_type: string;
  floor: string | null;
  capacity: number | null;
  address: string | null;
  entry_flow: string | null;
  rules: string | null;
  key_info: string | null;
}

interface Supply {
  id: string;
  room_id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  notes: string | null;
}

const CATEGORIES = ["消耗品", "清潔用品", "アメニティ", "備品", "その他"];
const UNITS = ["個", "枚", "本", "袋", "箱", "セット", "本(巻)", "ml"];

export default function FacilitiesRooms() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [view, setView] = useState<"rooms" | "supplies">("rooms");
  const [saving, setSaving] = useState(false);

  // Supply dialog
  const [supplyDialog, setSupplyDialog] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null);
  const [supplyForm, setSupplyForm] = useState({
    name: "", quantity: 0, unit: "個", category: "備品", notes: ""
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchRooms();
  }, [user]);

  const fetchRooms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rooms")
      .select("id,name,room_type,floor,capacity,address,entry_flow,rules,key_info")
      .order("name");
    setRooms(((data as any) || []) as Room[]);
    setLoading(false);
  };

  const fetchSupplies = async (roomId: string) => {
    const { data } = await supabase
      .from("room_supplies")
      .select("*")
      .eq("room_id", roomId)
      .order("category")
      .order("name");
    setSupplies(((data as any) || []) as Supply[]);
  };

  const selectRoom = (room: Room) => {
    setSelectedRoom(room);
    setView("supplies");
    fetchSupplies(room.id);
  };

  const handleSaveRoom = async () => {
    if (!selectedRoom) return;
    setSaving(true);
    const { error } = await supabase
      .from("rooms" as any)
      .update({
        floor: selectedRoom.floor,
        address: selectedRoom.address,
        entry_flow: selectedRoom.entry_flow,
        rules: selectedRoom.rules,
        key_info: selectedRoom.key_info,
      })
      .eq("id", selectedRoom.id);
    setSaving(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    toast.success("保存しました");
    fetchRooms();
  };

  const openAddSupply = () => {
    setEditingSupply(null);
    setSupplyForm({ name: "", quantity: 0, unit: "個", category: "備品", notes: "" });
    setSupplyDialog(true);
  };

  const openEditSupply = (s: Supply) => {
    setEditingSupply(s);
    setSupplyForm({ name: s.name, quantity: s.quantity, unit: s.unit, category: s.category, notes: s.notes || "" });
    setSupplyDialog(true);
  };

  const handleSaveSupply = async () => {
    if (!selectedRoom || !supplyForm.name) { toast.error("名前を入力してください"); return; }
    setSaving(true);
    if (editingSupply) {
      const { error } = await supabase
        .from("room_supplies" as any)
        .update({ ...supplyForm })
        .eq("id", editingSupply.id);
      if (error) { toast.error("保存に失敗しました"); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from("room_supplies" as any)
        .insert([{ ...supplyForm, room_id: selectedRoom.id }]);
      if (error) { toast.error("保存に失敗しました"); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("保存しました");
    setSupplyDialog(false);
    fetchSupplies(selectedRoom.id);
  };

  const handleDeleteSupply = async (id: string) => {
    await supabase.from("room_supplies" as any).delete().eq("id", id);
    setSupplies(prev => prev.filter(s => s.id !== id));
    toast.success("削除しました");
  };

  const handleQuantityChange = async (s: Supply, delta: number) => {
    const newQty = Math.max(0, s.quantity + delta);
    await supabase.from("room_supplies" as any).update({ quantity: newQty }).eq("id", s.id);
    setSupplies(prev => prev.map(x => x.id === s.id ? { ...x, quantity: newQty } : x));
  };

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = supplies.filter(s => s.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {} as Record<string, Supply[]>);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 md:p-6">
        <div className="max-w-5xl mx-auto">

          {view === "rooms" ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold">ルーム管理</h1>
                <p className="text-muted-foreground text-sm">ルームを選択して設備・住所・備品を管理</p>
              </div>
              {loading ? (
                <p className="text-muted-foreground">読み込み中...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rooms.map(room => (
                    <Card
                      key={room.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => selectRoom(room)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Package size={16} className="text-primary" />
                          {room.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground space-y-1">
                        {room.address && <p>📍 {room.address}</p>}
                        {room.floor && <p>🏢 {room.floor}</p>}
                        {room.capacity && <p>👥 定員 {room.capacity}名</p>}
                        <p className="text-xs text-primary pt-1">タップして詳細・備品管理 →</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : selectedRoom ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setView("rooms")}>← ルーム一覧</Button>
                <h1 className="text-xl font-bold">{selectedRoom.name}</h1>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左：ルーム情報 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">基本情報・設備</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>住所</Label>
                      <Input
                        value={selectedRoom.address || ""}
                        onChange={e => setSelectedRoom({ ...selectedRoom, address: e.target.value })}
                        placeholder="例：宮城県仙台市青葉区〇〇1-2-3"
                      />
                    </div>
                    <div>
                      <Label>フロア・部屋番号</Label>
                      <Input
                        value={selectedRoom.floor || ""}
                        onChange={e => setSelectedRoom({ ...selectedRoom, floor: e.target.value })}
                        placeholder="例：2F 201号室"
                      />
                    </div>
                    <div>
                      <Label>鍵の情報</Label>
                      <Textarea
                        value={selectedRoom.key_info || ""}
                        onChange={e => setSelectedRoom({ ...selectedRoom, key_info: e.target.value })}
                        rows={2}
                        placeholder="鍵の種類、場所、管理方法..."
                      />
                    </div>
                    <div>
                      <Label>入室フロー</Label>
                      <Textarea
                        value={selectedRoom.entry_flow || ""}
                        onChange={e => setSelectedRoom({ ...selectedRoom, entry_flow: e.target.value })}
                        rows={3}
                        placeholder="入室手順..."
                      />
                    </div>
                    <div>
                      <Label>使用規則</Label>
                      <Textarea
                        value={selectedRoom.rules || ""}
                        onChange={e => setSelectedRoom({ ...selectedRoom, rules: e.target.value })}
                        rows={3}
                        placeholder="使用に関する規則..."
                      />
                    </div>
                    <Button className="w-full" onClick={handleSaveRoom} disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </Button>
                  </CardContent>
                </Card>

                {/* 右：備品管理 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">備品・消耗品</h2>
                    <Button size="sm" onClick={openAddSupply}>
                      <Plus size={14} className="mr-1" />追加
                    </Button>
                  </div>

                  {supplies.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-muted-foreground text-sm">
                        備品がまだ登録されていません
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{cat}</p>
                          <div className="space-y-1.5">
                            {items.map(s => (
                              <div key={s.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{s.name}</p>
                                  {s.notes && <p className="text-xs text-muted-foreground truncate">{s.notes}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleQuantityChange(s, -1)}
                                    className="w-6 h-6 rounded border text-sm font-bold hover:bg-muted flex items-center justify-center"
                                  >−</button>
                                  <span className={cn(
                                    "w-10 text-center text-sm font-semibold",
                                    s.quantity <= 2 && "text-red-500"
                                  )}>
                                    {s.quantity}
                                    <span className="text-xs font-normal text-muted-foreground">{s.unit}</span>
                                  </span>
                                  <button
                                    onClick={() => handleQuantityChange(s, 1)}
                                    className="w-6 h-6 rounded border text-sm font-bold hover:bg-muted flex items-center justify-center"
                                  >＋</button>
                                </div>
                                <button onClick={() => openEditSupply(s)} className="text-muted-foreground hover:text-foreground p-1">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDeleteSupply(s.id)} className="text-muted-foreground hover:text-red-500 p-1">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </main>

      {/* 備品追加/編集ダイアログ */}
      <Dialog open={supplyDialog} onOpenChange={setSupplyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupply ? "備品を編集" : "備品を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>名前</Label>
              <Input
                value={supplyForm.name}
                onChange={e => setSupplyForm({ ...supplyForm, name: e.target.value })}
                placeholder="例：バスタオル"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>カテゴリ</Label>
                <Select value={supplyForm.category} onValueChange={v => setSupplyForm({ ...supplyForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>単位</Label>
                <Select value={supplyForm.unit} onValueChange={v => setSupplyForm({ ...supplyForm, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>数量</Label>
              <Input
                type="number"
                min={0}
                value={supplyForm.quantity}
                onChange={e => setSupplyForm({ ...supplyForm, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>メモ（任意）</Label>
              <Input
                value={supplyForm.notes}
                onChange={e => setSupplyForm({ ...supplyForm, notes: e.target.value })}
                placeholder="補充場所、注意事項など"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSaveSupply} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSupplyDialog(false)}>キャンセル</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
