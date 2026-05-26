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
import { toast } from "sonner";

interface Allowance {
  id: string;
  name: string;
  allowance_type: "fixed" | "percentage";
  amount: number;
  is_active: boolean;
}

export default function SystemAllowances() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    allowance_type: "fixed" as "fixed" | "percentage",
    amount: 0,
    is_active: true,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchAllowances();
  }, [user]);

  const fetchAllowances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("allowances").select("*").order("name");
      if (error && error.code !== "PGRST116") throw error;
      setAllowances(((data as any) || []) as Allowance[]);
    } catch (error) {
      console.error("Error fetching allowances:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("allowances" as any).insert([formData]);
      if (error) throw error;
      toast.success("手当を追加しました");
      setFormData({ name: "", allowance_type: "fixed", amount: 0, is_active: true });
      setShowForm(false);
      fetchAllowances();
    } catch (error) {
      console.error("Error adding allowance:", error);
      toast.error("追加に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("allowances" as any).delete().eq("id", id);
      if (error) throw error;
      toast.success("削除しました");
      fetchAllowances();
    } catch (error) {
      console.error("Error deleting allowance:", error);
      toast.error("削除に失敗しました");
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
              <h1 className="text-2xl font-bold">手当設定</h1>
              <p className="text-muted-foreground">給与手当の種別管理</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />追加
            </Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>手当を追加</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>手当名</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div>
                      <Label>種別</Label>
                      <Select value={formData.allowance_type} onValueChange={(v: "fixed" | "percentage") => setFormData({ ...formData, allowance_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">固定額</SelectItem>
                          <SelectItem value="percentage">割合（%）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{formData.allowance_type === "fixed" ? "金額（円）" : "割合（%）"}</Label>
                      <Input type="number" min="0" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
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
          ) : allowances.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">手当がありません</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {allowances.map((allowance) => (
                <Card key={allowance.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{allowance.name}</div>
                        <p className="text-sm text-muted-foreground">
                          {allowance.allowance_type === "fixed"
                            ? `¥${(allowance.amount || 0).toLocaleString()}`
                            : `${allowance.amount || 0}%`}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(allowance.id)}>
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
