import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  address: string;
  management_company: string;
  contract_status: string;
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
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold">{contract.name}</div>
                                  {contract.contract_status && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${contract.contract_status === "契約中" ? "bg-green-100 text-green-700" : contract.contract_status === "無料掲載" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                                      {contract.contract_status}
                                    </span>
                                  )}
                                </div>
                                {contract.amount > 0 && (
                                  <p className="text-sm font-medium mt-0.5">¥{contract.amount.toLocaleString()}<span className="text-muted-foreground font-normal">/月</span></p>
                                )}
                                {contract.management_company && <p className="text-xs text-muted-foreground">{contract.management_company}</p>}
                                {contract.address && <p className="text-xs text-muted-foreground truncate">{contract.address.replace(/\n/g, " ")}</p>}
                                {!contract.management_company && !contract.address && contract.notes && <p className="text-xs text-muted-foreground mt-1">{contract.notes}</p>}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/facilities/contracts/${contract.id}`)}>
                                <FileText size={13} className="mr-1" />詳細
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
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
