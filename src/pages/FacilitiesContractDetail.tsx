import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, PlusCircle } from "lucide-react";

const CONTRACT_TYPE_TO_EXPENSE_CATEGORY: Record<string, string> = {
  rental: "rent",
  utilities: "utilities",
  wifi: "wifi_tel",
  phone: "wifi_tel",
  suppliers: "maintenance",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  rental: "賃貸借契約",
  utilities: "水道光熱費",
  wifi: "Wi-Fi",
  phone: "電話",
  suppliers: "取引先",
};

interface Contract {
  id: string;
  contract_type: string;
  name: string;
  amount: number;
  start_date: string;
  end_date: string;
  payment_method: string;
  notes: string;
}

export default function FacilitiesContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contract, setContract] = useState<Contract | null>(null);
  const [form, setForm] = useState<Partial<Contract>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) fetchContract();
  }, [user, id]);

  const fetchContract = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("facility_contracts")
      .select("*")
      .eq("id", id)
      .single();
    if (error) { toast.error("読み込み失敗"); navigate("/facilities/contracts"); return; }
    setContract(data);
    setForm(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error("名称を入力してください"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("facility_contracts")
      .update({
        name: form.name,
        amount: form.amount || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) { toast.error(`保存失敗: ${error.message}`); return; }
    toast.success("保存しました");
    setContract({ ...contract!, ...form } as Contract);
  };

  const handleAddToExpenses = async () => {
    if (!contract || !form.amount || form.amount <= 0) {
      toast.error("金額を入力して保存してから追加してください");
      return;
    }
    setAdding(true);
    const today = new Date();
    const firstOfMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
    const expenseCategory = CONTRACT_TYPE_TO_EXPENSE_CATEGORY[contract.contract_type] || "maintenance";

    const { error } = await supabase.from("sales_expenses").insert([{
      date: firstOfMonth,
      category: expenseCategory,
      amount: form.amount,
      description: form.name || contract.name,
      payment_method: form.payment_method || "bank_transfer",
    }]);
    setAdding(false);
    if (error) { toast.error(`追加失敗: ${error.message}`); return; }
    toast.success(`今月分の固定費（¥${(form.amount || 0).toLocaleString()}）を経費に追加しました`);
  };

  const contractTypeLabel = contract ? (CONTRACT_TYPE_LABELS[contract.contract_type] || contract.contract_type) : "";

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => navigate("/facilities/contracts")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
            >
              <ArrowLeft size={14} />
              契約管理に戻る
            </button>
            <h1 className="text-2xl font-bold">{loading ? "..." : (form.name || "契約詳細")}</h1>
            <p className="text-muted-foreground text-sm">{contractTypeLabel}</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">契約情報</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>名称</Label>
                    <Input
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="例: ○○ビル 〇〇号室"
                    />
                  </div>
                  <div>
                    <Label>月額金額</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                      <Input
                        type="number"
                        min="0"
                        step="1000"
                        className="pl-7"
                        value={form.amount || ""}
                        onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>支払方法</Label>
                    <Select
                      value={form.payment_method || ""}
                      onValueChange={(v) => setForm({ ...form, payment_method: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">銀行振込</SelectItem>
                        <SelectItem value="cash">現金</SelectItem>
                        <SelectItem value="card">クレジットカード</SelectItem>
                        <SelectItem value="auto_debit">口座振替</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>契約開始日</Label>
                      <Input
                        type="date"
                        value={form.start_date || ""}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>契約終了日</Label>
                      <Input
                        type="date"
                        value={form.end_date || ""}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>メモ</Label>
                    <Textarea
                      value={form.notes || ""}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      placeholder="備考、担当者、連絡先など"
                    />
                  </div>
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? "保存中..." : "保存"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="text-base">固定費に追加</CardTitle>
                  <p className="text-xs text-muted-foreground">今月分の固定費として経費入力に追加します</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg mb-4">
                    <div>
                      <div className="text-sm font-medium">{form.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(), "yyyy年M月")}分 ·{" "}
                        {form.payment_method === "bank_transfer" ? "銀行振込" : form.payment_method === "cash" ? "現金" : form.payment_method === "card" ? "カード" : form.payment_method === "auto_debit" ? "口座振替" : "—"}
                      </div>
                    </div>
                    <div className="text-lg font-bold">
                      {form.amount ? `¥${(form.amount).toLocaleString()}` : "¥0"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full border-primary text-primary hover:bg-primary/10"
                    onClick={handleAddToExpenses}
                    disabled={adding || !form.amount}
                  >
                    <PlusCircle size={14} className="mr-2" />
                    {adding ? "追加中..." : "今月分の固定費に追加"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
