import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Room {
  id: string;
  name: string;
  room_type: string;
  floor: string | null;
  capacity: number | null;
  entry_flow: string | null;
  rules: string | null;
  key_info: string | null;
}

export default function FacilitiesRooms() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("inroom");

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
    try {
      const { data, error } = await supabase
        .from("rooms" as any)
        .select("id,name,room_type,floor,capacity,entry_flow,rules,key_info")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setRooms((data || []) as Room[]);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("rooms" as any)
        .update({
          floor: selected.floor,
          entry_flow: selected.entry_flow,
          rules: selected.rules,
          key_info: selected.key_info,
        })
        .eq("id", selected.id);
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

  const selectRoom = (room: Room, tab: string) => {
    setSelected(room);
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">ルーム管理</h1>
            <p className="text-muted-foreground">設備・入室フロー・使用規則の管理</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="inroom">インルーム</TabsTrigger>
              <TabsTrigger value="lazy">ラズルーム</TabsTrigger>
              <TabsTrigger value="equipment">設備管理</TabsTrigger>
              <TabsTrigger value="supplies">備品登録</TabsTrigger>
            </TabsList>

            {[
              { key: "inroom", label: "インルーム" },
              { key: "lazy", label: "ラズルーム" },
            ].map(({ key, label }) => (
              <TabsContent key={key} value={key}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {loading ? (
                    <div className="text-muted-foreground">読み込み中...</div>
                  ) : rooms.filter(r => r.room_type === label).length === 0 ? (
                    <Card className="md:col-span-2">
                      <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                        データがありません
                      </CardContent>
                    </Card>
                  ) : (
                    rooms.filter(r => r.room_type === label).map((room) => (
                      <Card
                        key={room.id}
                        className={`cursor-pointer transition-colors ${selected?.id === room.id ? "border-primary bg-muted/30" : "hover:bg-muted/30"}`}
                        onClick={() => selectRoom(room, "equipment")}
                      >
                        <CardHeader>
                          <CardTitle className="text-base">{room.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {room.floor && <p className="text-sm text-muted-foreground">{room.floor}</p>}
                          {room.capacity && <p className="text-sm text-muted-foreground">定員：{room.capacity}名</p>}
                          <p className="text-xs text-primary mt-1">クリックして設備管理を編集</p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            ))}

            <TabsContent value="equipment">
              {selected ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{selected.name} - 設備管理</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>フロア・場所</Label>
                      <Input
                        value={selected.floor || ""}
                        onChange={(e) => setSelected({ ...selected, floor: e.target.value })}
                        placeholder="例：2F 201号室"
                      />
                    </div>
                    <div>
                      <Label>鍵の情報</Label>
                      <Textarea
                        value={selected.key_info || ""}
                        onChange={(e) => setSelected({ ...selected, key_info: e.target.value })}
                        rows={3}
                        placeholder="鍵の種類、場所、管理方法..."
                      />
                    </div>
                    <div>
                      <Label>入室フロー</Label>
                      <Textarea
                        value={selected.entry_flow || ""}
                        onChange={(e) => setSelected({ ...selected, entry_flow: e.target.value })}
                        rows={4}
                        placeholder="入室手順..."
                      />
                    </div>
                    <div>
                      <Label>使用規則</Label>
                      <Textarea
                        value={selected.rules || ""}
                        onChange={(e) => setSelected({ ...selected, rules: e.target.value })}
                        rows={4}
                        placeholder="使用に関する規則..."
                      />
                    </div>
                    <Button className="w-full" onClick={handleSave} disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                    インルーム・ラズルームタブからルームを選択してください
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="supplies">
              <Card>
                <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                  備品登録（設備管理 &gt; 消耗品 を参照）
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
