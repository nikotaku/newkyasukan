import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NotionDatabaseView } from "@/components/database/NotionDatabaseView";
import { Property, DatabaseRecord } from "@/components/database/types";
import { toast } from "sonner";
import { ImportModal } from "@/components/ImportModal";
import { FileUp, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoogleSheetPanel } from "@/components/GoogleSheetPanel";

const DEFAULT_PROPERTIES: Property[] = [
  { id: "name", name: "名前", type: "text", width: 140 },
  { id: "phone", name: "電話番号", type: "phone", width: 140 },
  { id: "visit_count", name: "来店回数", type: "number", width: 100 },
  { id: "total_spent", name: "累計売上", type: "number", width: 110 },
  { id: "last_visited", name: "最終来店", type: "date", width: 110 },
  {
    id: "tags", name: "タグ", type: "multi_select", width: 180,
    options: [
      { label: "VIP", color: "purple" },
      { label: "常連", color: "blue" },
      { label: "新規", color: "green" },
      { label: "要注意", color: "red" },
      { label: "紹介", color: "orange" },
    ],
  },
  { id: "notes", name: "メモ", type: "text", width: 200 },
];

function mapToRecord(row: any): DatabaseRecord {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    visit_count: row.visit_count ?? row.total_visits ?? null,
    total_spent: row.total_spent ?? null,
    last_visited: row.last_visited ?? row.last_visit_date ?? null,
    tags: row.tags ?? null,
    notes: row.notes ?? row.memo ?? null,
    email: row.email ?? null,
  };
}

export default function CustomerDatabase() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [records, setRecords] = useState<DatabaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchCustomers();
  }, [user]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setRecords((data || []).map(mapToRecord));
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (data: Record<string, any>) => {
    try {
      const { error } = await supabase.from("customers").insert([{
        name: data.name,
        phone: data.phone,
        notes: data.notes,
        tags: data.tags,
        email: data.email,
      }]);
      if (error) throw error;
      toast.success("追加しました");
      fetchCustomers();
    } catch (error) {
      console.error("Error adding customer:", error);
      toast.error("追加に失敗しました");
    }
  };

  const handleUpdate = async (id: string, field: string, value: any) => {
    try {
      const { error } = await supabase
        .from("customers")
        .update({ [field]: value })
        .eq("id", id);
      if (error) throw error;
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    } catch (error) {
      console.error("Error updating customer:", error);
      toast.error("更新に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      toast.success("削除しました");
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("削除に失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6 flex flex-col" style={{ height: "100vh" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">顧客一覧</h1>
            <p className="text-muted-foreground text-sm">列設定から表示項目をカスタマイズできます</p>
          </div>
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <FileUp size={16} className="mr-2" />CSVインポート
          </Button>
        </div>
        <Tabs defaultValue="db" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mb-3 shrink-0">
            <TabsTrigger value="db">データベース</TabsTrigger>
            <TabsTrigger value="sheet" className="gap-1.5">
              <Table2 size={13} />Googleスプレッドシート
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sheet" className="mt-0">
            <GoogleSheetPanel source="customers" />
          </TabsContent>
          <TabsContent value="db" className="flex-1 overflow-hidden mt-0">
            <NotionDatabaseView
              title="顧客"
              storageKey="customers"
              defaultProperties={DEFAULT_PROPERTIES}
              records={records}
              loading={loading}
              onAddRecord={handleAdd}
              onUpdateRecord={handleUpdate}
              onDeleteRecord={handleDelete}
            />
          </TabsContent>
        </Tabs>
      </main>
      <ImportModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        type="customers"
        onSuccess={fetchCustomers}
      />
    </div>
  );
}
