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
import { useToast } from "@/hooks/use-toast";

interface Deduction {
  id: string;
  name: string;
  deduction_type: "fixed" | "percentage";
  amount: number;
  rule?: string | null;
  is_active: boolean;
}

export default function SystemDeductions() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    deduction_type: "fixed" as "fixed" | "percentage",
    amount: 0,
    rule: "",
    is_active: true,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchDeductions();
  }, [user]);

  const fetchDeductions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("deductions").select("*").order("name");
      if (error && error.code !== "PGRST116") throw error;
      setDeductions(((data as any) || []) as Deduction[]);
    } catch (error) {
      console.error("Error fetching deductions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("deductions").insert([formData]);
      if (error) throw error;
      setFormData({ name: "", deduction_type: "fixed", amount: 0, rule: "", is_active: true });
      setShowForm(false);
      fetchDeductions();
    } catch (error) {
      toast({ variant: "destructive", title: "エラー", description: error instanceof Error ? error.message : "控除の追加に失敗しました" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("deductions").delete().eq("id", id);
      if (error) throw error;
      fetchDeductions();
    } catch (error) {
      toast({ variant: "destructive", title: "エラー", description: error instanceof Error ? error.message : "控除の削除に失敗しました" });
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
              <h1 className="text-2xl font-bold">控除設定</h1>
              <p className="text-muted-foreground">給与控除の種別管理</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />追加
            </Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>控除を追加</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>控除名</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div>
                      <Label>種別</Label>
                      <Select value={formData.deduction_type} onValueChange={(v: "fixed" | "percentage") => setFormData({ ...formData, deduction_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">固定額</SelectItem>
                          <SelectItem value="percentage">割合（%）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{formData.deduction_type === "fixed" ? "金額（円）" : "割合（%）"}</Label>
                      <Input type="number" min="0" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label>ルール</Label>
                    <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background p-2 text-sm" value={formData.rule} onChange={(e) => setFormData({ ...formData, rule: e.target.value })} placeholder="例: 毎月発生 / 売上の◯%など" />
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
          ) : deductions.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">控除がありません</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {deductions.map((deduction) => (
                <Card key={deduction.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold">{deduction.name}</div>
                        <p className="text-sm text-muted-foreground">
                          {deduction.deduction_type === "fixed"
                            ? `¥${(deduction.amount || 0).toLocaleString()}`
                            : `${deduction.amount || 0}%`}
                        </p>
                        {deduction.rule && <div className="text-sm mt-1 whitespace-pre-wrap">{deduction.rule}</div>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(deduction.id)}>
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
