import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Trash2 } from "lucide-react";

interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  payment_method: string;
}

// 損益スプレッドシート（販管費及び一般管理費）と同一の項目
const FIXED_CATEGORIES: Record<string, string> = {
  "賃借料（ラズルーム）": "賃借料（ラズルーム）",
  "賃借料（インルーム）": "賃借料（インルーム）",
  "広告媒体費（エスたま）": "広告媒体費（エスたま）",
  "広告媒体費（エスラン）": "広告媒体費（エスラン）",
  "ラズルーム電気代": "ラズルーム電気代",
  "ラズルームガス代": "ラズルームガス代",
  "ラズルーム水道代": "ラズルーム水道代",
  "インルーム電気代": "インルーム電気代",
  "インルーム水道代": "インルーム水道代",
  "通信費": "通信費",
};

const VARIABLE_CATEGORIES: Record<string, string> = {
  "接待交際費": "接待交際費",
  "B": "B",
  "備品購入費": "備品購入費",
  "交通費": "交通費",
  "外注費": "外注費",
  "内部留保": "内部留保",
  "特別損害金": "特別損害金",
  "その他": "その他",
};

// 旧カテゴリキー（過去データ表示用。選択肢には出さず固定費として扱う）
const LEGACY_CATEGORIES: Record<string, string> = {
  rent: "賃貸料", utilities: "光熱費", wifi_tel: "Wi-Fi・通信費", maintenance: "保守費・定期契約",
  consumption: "消耗品", supplies: "備品", advertising: "広告費", transport: "交通費", other: "その他",
  "広告媒体費（キャスカン）": "広告媒体費（キャスカン）",
  "水道光熱費（①電気）": "水道光熱費（①電気）", "水道光熱費（①水道）": "水道光熱費（①水道）",
  "水道光熱費（①ガス）": "水道光熱費（①ガス）", "水道光熱費（②電気）": "水道光熱費（②電気）",
  "水道光熱費（②水道）": "水道光熱費（②水道）",
};

const ALL_CATEGORIES = { ...FIXED_CATEGORIES, ...VARIABLE_CATEGORIES, ...LEGACY_CATEGORIES };
const FIXED_KEYS = new Set([
  ...Object.keys(FIXED_CATEGORIES), "rent", "utilities", "wifi_tel", "maintenance",
  "広告媒体費（キャスカン）", "水道光熱費（①電気）", "水道光熱費（①水道）",
  "水道光熱費（①ガス）", "水道光熱費（②電気）", "水道光熱費（②水道）",
]);

function isFixed(category: string) {
  return FIXED_KEYS.has(category);
}

const emptyForm = (category: string) => ({
  date: format(new Date(), "yyyy-MM-dd"),
  category,
  amount: 0,
  description: "",
  payment_method: "cash",
});

function ExpenseForm({
  categories,
  defaultCategory,
  onSaved,
}: {
  categories: Record<string, string>;
  defaultCategory: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(emptyForm(defaultCategory));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) {
      toast.error("金額を入力してください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("expenses").insert([{
      expense_date: form.date,
      expense_type: form.category,
      amount: form.amount,
      description: form.description,
      payment_method: form.payment_method,
    }]);
    setSaving(false);
    if (error) { toast.error(`保存失敗: ${error.message}`); return; }
    toast.success("経費を追加しました");
    setForm(emptyForm(defaultCategory));
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>日付</Label>
        <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <div>
        <Label>カテゴリー</Label>
        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(categories).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>金額</Label>
        <Input type="number" min="0" step="100" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
      </div>
      <div>
        <Label>支払方法</Label>
        <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">現金</SelectItem>
            <SelectItem value="card">クレジットカード</SelectItem>
            <SelectItem value="bank_transfer">銀行振込</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>説明</Label>
        <Input placeholder="例: 7月分家賃" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "保存中..." : "追加"}
      </Button>
    </form>
  );
}

function ExpenseList({
  expenses,
  loading,
  onDelete,
}: {
  expenses: Expense[];
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-muted-foreground">{expenses.length}件</span>
        <span className="font-bold text-lg">合計 ¥{total.toLocaleString()}</span>
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">読み込み中...</div>
      ) : expenses.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">データなし</div>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{e.description || ALL_CATEGORIES[e.category] || e.category}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(e.date), "yyyy/MM/dd", { locale: ja })}
                  {" · "}{ALL_CATEGORIES[e.category] || e.category}
                  {" · "}{e.payment_method === "cash" ? "現金" : e.payment_method === "card" ? "カード" : "振込"}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3">
                <span className="font-bold">¥{(e.amount || 0).toLocaleString()}</span>
                <button
                  onClick={() => onDelete(e.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SalesExpenseInput() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchExpenses();
  }, [user]);

  const fetchExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("id, expense_date, expense_type, amount, description, payment_method")
      .order("expense_date", { ascending: false })
      .limit(200);
    if (!error) {
      setExpenses((data || []).map((r) => ({
        id: r.id,
        date: r.expense_date,
        category: r.expense_type,
        amount: r.amount,
        description: r.description || "",
        payment_method: r.payment_method || "cash",
      })));
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { toast.error("削除失敗"); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    toast.success("削除しました");
  };

  const fixed = expenses.filter((e) => isFixed(e.category));
  const variable = expenses.filter((e) => !isFixed(e.category));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">経費入力</h1>
            <p className="text-muted-foreground text-sm">固定費・変動費の記録・管理</p>
          </div>

          <Tabs defaultValue="fixed">
            <TabsList className="mb-6">
              <TabsTrigger value="fixed">固定費</TabsTrigger>
              <TabsTrigger value="variable">変動費</TabsTrigger>
            </TabsList>

            <TabsContent value="fixed">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">固定費を追加</CardTitle></CardHeader>
                  <CardContent>
                    <ExpenseForm categories={FIXED_CATEGORIES} defaultCategory="賃借料（ラズルーム）" onSaved={fetchExpenses} />
                  </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">固定費一覧</CardTitle></CardHeader>
                  <CardContent>
                    <ExpenseList expenses={fixed} loading={loading} onDelete={handleDelete} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="variable">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">変動費を追加</CardTitle></CardHeader>
                  <CardContent>
                    <ExpenseForm categories={VARIABLE_CATEGORIES} defaultCategory="接待交際費" onSaved={fetchExpenses} />
                  </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">変動費一覧</CardTitle></CardHeader>
                  <CardContent>
                    <ExpenseList expenses={variable} loading={loading} onDelete={handleDelete} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
