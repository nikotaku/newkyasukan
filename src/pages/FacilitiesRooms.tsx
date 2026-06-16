import { useState, useEffect, useRef } from "react";
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
import { Trash2, Plus, MapPin, KeyRound, DoorOpen, Save, Upload, X, MessageSquare, Link } from "lucide-react";

interface Room {
  id: string;
  name: string;
  room_type: string | null;
  address: string | null;
  entry_flow: string | null;
  key_number: string | null;
  key_info: string | null;
  entry_photos: string[] | null;
  sms_text: string | null;
  map_url: string | null;
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

interface CostumeItem {
  id: string;
  room_id: string;
  name: string;
  size: string | null;
  quantity: number;
  notes: string | null;
}

export default function FacilitiesRooms() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingEntryPhotos, setUploadingEntryPhotos] = useState(false);
  const entryPhotoInputRef = useRef<HTMLInputElement>(null);

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [costumes, setCostumes] = useState<CostumeItem[]>([]);
  const [newEquip, setNewEquip] = useState({ name: "", quantity: "1", notes: "" });
  const [newSupply, setNewSupply] = useState({ name: "", quantity: "0", unit: "", notes: "" });
  const [newCostume, setNewCostume] = useState({ name: "", size: "", quantity: "1", notes: "" });

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
      fetchCostumes(selectedId);
    } else {
      setDraft(null);
      setEquipment([]);
      setSupplies([]);
      setCostumes([]);
    }
  }, [selectedId, rooms]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rooms" as any)
        .select("id,name,room_type,address,entry_flow,key_number,key_info,entry_photos,sms_text,map_url")
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

  const fetchCostumes = async (roomId: string) => {
    const { data } = await supabase
      .from("room_costumes" as any)
      .select("id,room_id,name,size,quantity,notes")
      .eq("room_id", roomId)
      .order("created_at");
    setCostumes((data || []) as unknown as CostumeItem[]);
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
          entry_photos: draft.entry_photos?.length ? draft.entry_photos : null,
          sms_text: draft.sms_text || null,
          map_url: draft.map_url || null,
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

  const handleEntryPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft || !e.target.files?.length) return;
    setUploadingEntryPhotos(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(e.target.files)) {
        const ext = file.name.split(".").pop();
        const path = `${draft.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("entry-photos").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("entry-photos").getPublicUrl(path);
        uploaded.push(urlData.publicUrl);
      }
      setDraft({ ...draft, entry_photos: [...(draft.entry_photos || []), ...uploaded] });
    } catch (err) {
      console.error(err);
      toast.error("写真のアップロードに失敗しました");
    } finally {
      setUploadingEntryPhotos(false);
      if (entryPhotoInputRef.current) entryPhotoInputRef.current.value = "";
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

  const addCostume = async () => {
    if (!selectedId || !newCostume.name.trim()) {
      toast.error("衣装名を入力してください");
      return;
    }
    const { error } = await supabase.from("room_costumes" as any).insert({
      room_id: selectedId,
      name: newCostume.name.trim(),
      size: newCostume.size.trim() || null,
      quantity: parseInt(newCostume.quantity, 10) || 1,
      notes: newCostume.notes.trim() || null,
    });
    if (error) {
      toast.error("追加に失敗しました");
      return;
    }
    setNewCostume({ name: "", size: "", quantity: "1", notes: "" });
    fetchCostumes(selectedId);
  };

  const deleteCostume = async (id: string) => {
    const { error } = await supabase.from("room_costumes" as any).delete().eq("id", id);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    setCostumes((prev) => prev.filter((c) => c.id !== id));
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
                  <div>
                    <Label className="flex items-center gap-1.5"><Upload size={14} />入室方法の写真</Label>
                    <input
                      ref={entryPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleEntryPhotoUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 gap-1.5"
                      onClick={() => entryPhotoInputRef.current?.click()}
                      disabled={uploadingEntryPhotos}
                    >
                      <Upload size={14} />{uploadingEntryPhotos ? "アップロード中..." : "写真を選択"}
                    </Button>
                    {(draft.entry_photos?.length ?? 0) > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {draft.entry_photos!.map((photo, index) => (
                          <div key={index} className="relative group">
                            <img src={photo} alt="" className="w-full h-24 object-cover rounded-md border" />
                            <button
                              type="button"
                              className="absolute top-1 right-1 bg-rose-600 text-white rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setDraft({ ...draft, entry_photos: draft.entry_photos!.filter((_, i) => i !== index) })}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><MessageSquare size={14} />お客様用SMS案内文</Label>
                    <Textarea
                      className="mt-1"
                      rows={5}
                      value={draft.sms_text || ""}
                      onChange={(e) => setDraft({ ...draft, sms_text: e.target.value })}
                      placeholder={`例：\n【ルーム案内】\n到着後、オートロックは1234を押してください。\nエレベーターで3Fへ上がり301号室です。`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">予約確認SMSの末尾に自動的に追記されます</p>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><Link size={14} />グーグルマップリンク</Label>
                    <Input
                      className="mt-1"
                      value={draft.map_url || ""}
                      onChange={(e) => setDraft({ ...draft, map_url: e.target.value })}
                      placeholder="https://maps.app.goo.gl/..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">SMSに住所と合わせて記載されます</p>
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

              {/* 衣装DB */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">衣装DB</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {costumes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">登録された衣装はありません</p>
                    ) : (
                      costumes.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                          <span className="font-medium flex-1">{c.name}</span>
                          {c.size && <span className="text-muted-foreground text-xs">サイズ：{c.size}</span>}
                          <span className="text-muted-foreground">×{c.quantity}</span>
                          {c.notes && <span className="text-muted-foreground text-xs">{c.notes}</span>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" onClick={() => deleteCostume(c.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs">衣装名</Label>
                      <Input className="mt-1 h-8" value={newCostume.name} onChange={(e) => setNewCostume({ ...newCostume, name: e.target.value })} placeholder="例：ナース服" />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs">サイズ</Label>
                      <Input className="mt-1 h-8" value={newCostume.size} onChange={(e) => setNewCostume({ ...newCostume, size: e.target.value })} placeholder="M" />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs">数量</Label>
                      <Input className="mt-1 h-8" type="number" value={newCostume.quantity} onChange={(e) => setNewCostume({ ...newCostume, quantity: e.target.value })} />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs">メモ</Label>
                      <Input className="mt-1 h-8" value={newCostume.notes} onChange={(e) => setNewCostume({ ...newCostume, notes: e.target.value })} placeholder="任意" />
                    </div>
                    <Button size="sm" className="h-8 gap-1" onClick={addCostume}><Plus size={14} />追加</Button>
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
