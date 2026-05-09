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

interface Room {
  id: string;
  name: string;
  room_type: string;
  floor: string;
  capacity: number;
  notes: string;
  entry_flow: string;
  rules: string;
  key_info: string;
}

export default function FacilitiesRooms() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Room | null>(null);

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
        .from("facility_rooms")
        .select("*")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setRooms(data || []);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      const { error } = await supabase
        .from("facility_rooms")
        .upsert(selected, { onConflict: "id" });
      if (error) throw error;
      fetchRooms();
    } catch (error) {
      console.error("Error saving room:", error);
    }
  };

  const roomTypes = ["インルーム", "ラズルーム", "その他"];

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

          <Tabs defaultValue="inroom">
            <TabsList className="mb-6">
              <TabsTrigger value="inroom">インルーム</TabsTrigger>
              <TabsTrigger value="lazy">ラズルーム</TabsTrigger>
              <TabsTrigger value="equipment">設備管理</TabsTrigger>
              <TabsTrigger value="supplies">備品登録</TabsTrigger>
            </TabsList>

            {["inroom", "lazy"].map((type) => (
              <TabsContent key={type} value={type}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {loading ? (
                    <div className="text-muted-foreground">読み込み中...</div>
                  ) : rooms.filter(r => r.room_type === (type === "inroom" ? "インルーム" : "ラズルーム")).length === 0 ? (
                    <Card className="md:col-span-2">
                      <CardContent className="pt-12 pb-12 text-center text-muted-foreground">データがありません</CardContent>
                    </Card>
                  ) : (
                    rooms.filter(r => r.room_type === (type === "inroom" ? "インルーム" : "ラズルーム")).map((room) => (
                      <Card key={room.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelected(room)}>
                        <CardHeader>
                          <CardTitle className="text-base">{room.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{room.floor}</p>
                          <p className="text-sm text-muted-foreground">定員：{room.capacity}名</p>
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
                  <CardHeader><CardTitle>{selected.name} - 設備管理</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>鍵の情報</Label>
                      <Textarea value={selected.key_info || ""} onChange={(e) => setSelected({ ...selected, key_info: e.target.value })} rows={3} placeholder="鍵の種類、場所、管理方法..." />
                    </div>
                    <div>
                      <Label>入室フロー</Label>
                      <Textarea value={selected.entry_flow || ""} onChange={(e) => setSelected({ ...selected, entry_flow: e.target.value })} rows={4} placeholder="入室手順..." />
                    </div>
                    <div>
                      <Label>使用規則</Label>
                      <Textarea value={selected.rules || ""} onChange={(e) => setSelected({ ...selected, rules: e.target.value })} rows={4} placeholder="使用に関する規則..." />
                    </div>
                    <Button className="w-full" onClick={handleSave}>保存</Button>
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">インルーム・ラズルームタブからルームを選択してください</CardContent></Card>
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
