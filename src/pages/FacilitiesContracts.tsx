import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";

export const PREDEFINED_TAGS = [
  "掲載サイト",
  "賃貸",
  "光熱費",
  "Wi-Fi・通信",
  "取引先",
  "備品・消耗品",
  "その他",
];

interface Contract {
  id: string;
  name: string;
  tags: string[];
  amount: number;
  contract_status: string;
  management_company: string;
  address: string;
  notes: string;
}

export default function FacilitiesContracts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState("すべて");

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
      const { data, error } = await supabase
        .from("facility_contracts")
        .select("id,name,tags,amount,contract_status,management_company,address,notes")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setContracts((data || []).map((c) => ({ ...c, tags: c.tags || [] })));
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const allTags = Array.from(
    new Set([...PREDEFINED_TAGS, ...contracts.flatMap((c) => c.tags)])
  );

  const tabs = ["すべて", ...allTags];

  const filteredContracts =
    activeTag === "すべて"
      ? contracts
      : contracts.filter((c) => c.tags.includes(activeTag));

  const handleCreate = async () => {
    const initialTags = activeTag !== "すべて" ? [activeTag] : [];
    const { data, error } = await supabase
      .from("facility_contracts")
      .insert([{ name: "新規", tags: initialTags, amount: 0, notes: "" }])
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">契約管理</h1>
              <p className="text-muted-foreground">各種契約の管理</p>
            </div>
            <Button size="sm" onClick={handleCreate}>
              <Plus size={14} className="mr-1" />新規追加
            </Button>
          </div>

          {/* Tag tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {tabs.map((tag) => {
              const count = tag === "すべて"
                ? contracts.length
                : contracts.filter((c) => c.tags.includes(tag)).length;
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    activeTag === tag
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {tag}
                  <span className={`ml-1.5 text-xs ${activeTag === tag ? "opacity-70" : "opacity-50"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Contract list */}
          <div className="space-y-3">
            {loading ? (
              <div className="text-center text-muted-foreground py-8">読み込み中...</div>
            ) : filteredContracts.length === 0 ? (
              <Card>
                <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                  データがありません
                </CardContent>
              </Card>
            ) : (
              filteredContracts.map((contract) => (
                <Card key={contract.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold">{contract.name}</div>
                          {contract.contract_status && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                contract.contract_status === "契約中"
                                  ? "bg-green-100 text-green-700"
                                  : contract.contract_status === "無料掲載"
                                  ? "bg-blue-100 text-blue-700"
                                  : contract.contract_status === "解約済み"
                                  ? "bg-red-100 text-red-600"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {contract.contract_status}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {contract.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        {contract.amount > 0 && (
                          <p className="text-sm font-medium mt-1">
                            ¥{contract.amount.toLocaleString()}
                            <span className="text-muted-foreground font-normal">/月</span>
                          </p>
                        )}
                        {contract.management_company && (
                          <p className="text-xs text-muted-foreground">{contract.management_company}</p>
                        )}
                        {contract.address && (
                          <p className="text-xs text-muted-foreground truncate">
                            {contract.address.replace(/\n/g, " ")}
                          </p>
                        )}
                        {!contract.management_company && !contract.address && contract.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{contract.notes}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/facilities/contracts/${contract.id}`)}
                        className="shrink-0"
                      >
                        <FileText size={13} className="mr-1" />詳細
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
