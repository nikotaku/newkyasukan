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
import { Plus, FileText } from "lucide-react";

interface Contract {
  id: string;
  contract_type: string;
  name: string;
  amount: number;
  start_date: string;
  end_date: string;
  notes: string;
}

const CONTRACT_TYPES = [
  { key: "rental", label: "賃貸借契約" },
  { key: "utilities", label: "水道光熱費" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "phone", label: "電話" },
  { key: "suppliers", label: "取引先" },
];

export default function FacilitiesContracts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchContracts();
  }, [user]);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("facility_contracts").select("*").order("contract_type");
      if (error && error.code !== "PGRST116") throw error;
      setContracts(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingContract) return;
    try {
      const { error } = await supabase.from("facility_contracts").upsert(editingContract, { onConflict: "id" });
      if (error) throw error;
      setEditingContract(null);
      fetchContracts();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleCreate = async (contractType: string) => {
    const { data, error } = await supabase
      .from("facility_contracts")
      .insert([{ contract_type: contractType, name: "新規契約", amount: 0, notes: "" }])
      .select()
      .single();
    if (error) { toast.error("作成失敗"); return; }
    navigate(`/facilities/contracts/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">契約管理</h1>
            <p className="text-muted-foreground">各種契約の管理</p>
          </div>

          <Tabs defaultValue="rental">
            <TabsList className="mb-6 flex-wrap">
              {CONTRACT_TYPES.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
              ))}
            </TabsList>

            {CONTRACT_TYPES.map(({ key, label }) => {
              const typeContracts = contracts.filter((c) => c.contract_type === key);
              return (
                <TabsContent key={key} value={key}>
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => handleCreate(key)}>
                        <Plus size={14} className="mr-1" />新規追加
                      </Button>
                    </div>
                    {loading ? (
                      <div className="text-center text-muted-foreground">読み込み中...</div>
                    ) : typeContracts.length === 0 ? (
                      <Card><CardContent className="pt-10 pb-10 text-center text-muted-foreground">データがありません</CardContent></Card>
                    ) : (
                      typeContracts.map((contract) => (
                        <Card key={contract.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-semibold">{contract.name}</div>
                                {contract.amount > 0 && (
                                  <p className="text-sm text-muted-foreground">¥{contract.amount.toLocaleString()}/月</p>
                                )}
                                {contract.notes && <p className="text-xs text-muted-foreground mt-1">{contract.notes}</p>}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => navigate(`/facilities/contracts/${contract.id}`)}>
                                  <FileText size={13} className="mr-1" />詳細
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingContract(contract)}>編集</Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}

                    {editingContract && editingContract.contract_type === key && (
                      <Card>
                        <CardHeader><CardTitle>編集</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <Label>名称</Label>
                            <Input value={editingContract.name || ""} onChange={(e) => setEditingContract({ ...editingContract, name: e.target.value })} />
                          </div>
                          <div>
                            <Label>金額（月）</Label>
                            <Input type="number" value={editingContract.amount || 0} onChange={(e) => setEditingContract({ ...editingContract, amount: Number(e.target.value) })} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>開始日</Label>
                              <Input type="date" value={editingContract.start_date || ""} onChange={(e) => setEditingContract({ ...editingContract, start_date: e.target.value })} />
                            </div>
                            <div>
                              <Label>終了日</Label>
                              <Input type="date" value={editingContract.end_date || ""} onChange={(e) => setEditingContract({ ...editingContract, end_date: e.target.value })} />
                            </div>
                          </div>
                          <div>
                            <Label>メモ</Label>
                            <Textarea value={editingContract.notes || ""} onChange={(e) => setEditingContract({ ...editingContract, notes: e.target.value })} rows={3} />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleSave}>保存</Button>
                            <Button variant="outline" onClick={() => setEditingContract(null)}>キャンセル</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
