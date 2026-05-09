import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  payment_method: string;
}

export default function SalesExpenseInput() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    category: "consumption",
    amount: 0,
    description: "",
    payment_method: "cash",
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchExpenses();
    }
  }, [user]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales_expenses")
        .select("*")
        .order("date", { ascending: false })
        .limit(30);

      if (error && error.code !== "PGRST116") throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("sales_expenses")
        .insert([
          {
            date: formData.date,
            category: formData.category,
            amount: formData.amount,
            description: formData.description,
            payment_method: formData.payment_method,
          },
        ]);

      if (error) throw error;
      setFormData({
        date: format(new Date(), "yyyy-MM-dd"),
        category: "consumption",
        amount: 0,
        description: "",
        payment_method: "cash",
      });
      fetchExpenses();
    } catch (error) {
      console.error("Error adding expense:", error);
    }
  };

  const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const categoryTotals = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">経費入力</h1>
            <p className="text-muted-foreground">
              営業経費の記録・管理
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  合計経費
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{totalExpense.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            {Object.entries(categoryTotals).map(([category, amount]) => (
              <Card key={category}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium capitalize">
                    {category}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">
                    ¥{amount.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>経費を追加</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="date">日付</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">カテゴリー</Label>
                    <Select value={formData.category} onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }>
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consumption">消耗品</SelectItem>
                        <SelectItem value="utilities">光熱費</SelectItem>
                        <SelectItem value="rent">賃貸料</SelectItem>
                        <SelectItem value="supplies">備品</SelectItem>
                        <SelectItem value="maintenance">保守費</SelectItem>
                        <SelectItem value="other">その他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="amount">金額</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="0"
                      step="100"
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData({ ...formData, amount: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment">支払い方法</Label>
                    <Select value={formData.payment_method} onValueChange={(value) =>
                      setFormData({ ...formData, payment_method: value })
                    }>
                      <SelectTrigger id="payment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">現金</SelectItem>
                        <SelectItem value="card">クレジットカード</SelectItem>
                        <SelectItem value="bank_transfer">銀行振込</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="description">説明</Label>
                    <Input
                      id="description"
                      type="text"
                      placeholder="例: 清掃用品の購入"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    追加
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>最近の経費</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center text-muted-foreground">
                    読み込み中...
                  </div>
                ) : expenses.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    経費がありません
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">
                              {expense.description || expense.category}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(expense.date), "yyyy/MM/dd", { locale: ja })} • {expense.payment_method}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">
                              ¥{(expense.amount || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
