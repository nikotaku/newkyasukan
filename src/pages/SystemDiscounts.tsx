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
import { Plus, Trash2 } from "lucide-react";

interface Discount {
  id: string;
  name: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  is_active: boolean;
}

export default function SystemDiscounts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    discount_type: "fixed" as "fixed" | "percentage",
    discount_value: 0,
    is_active: true,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchDiscounts();
  }, [user]);

  const fetchDiscounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("discounts").select("*").order("name");
      if (error && error.code !== "PGRST116") throw error;
      setDiscounts(data || []);
    } catch (error) {
      console.error("Error fetching discounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("discounts").insert([formData]);
      if (error) throw error;
      setFormData({ name: "", discount_type: "fixed", discount_value: 0, is_active: true });
      setShowForm(false);
      fetchDiscounts();
    } catch (error) {
      console.error("Error adding discount:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("discounts").delete().eq("id", id);
      if (error) throw error;
      fetchDiscounts();
    } catch (error) {
      console.error("Error deleting discount:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">各種割引設定</h1>
              <p className="text-muted-foreground">割引種別の管理</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />追加
            </Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>割引を追加</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>割引名</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div>
                      <Label>種別</Label>
                      <Select value={formData.discount_type} onValueChange={(v: "fixed" | "percentage") => setFormData({ ...formData, discount_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">固定額</SelectItem>
                          <SelectItem value="percentage">割合（%）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{formData.discount_type === "fixed" ? "金額（円）" : "割合（%）"}</Label>
                      <Input type="number" min="0" value={formData.discount_value} onChange={(e) => setFormData({ ...formData, discount_value: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">保存</Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>キャンセル</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : discounts.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">割引がありません</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {discounts.map((discount) => (
                <Card key={discount.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{discount.name}</div>
                        <p className="text-sm text-muted-foreground">
                          {discount.discount_type === "fixed"
                            ? `¥${(discount.discount_value || 0).toLocaleString()} 引き`
                            : `${discount.discount_value || 0}% 引き`}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(discount.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
