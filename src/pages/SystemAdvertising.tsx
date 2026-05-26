import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdExpense {
  id: string;
  name: string;
  amount: number;
  rule: string | null;
  is_active: boolean;
}

export default function SystemAdvertising() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<AdExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", amount: 0, rule: "", is_active: true });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => { if (!authLoading && !user) navigate("/login"); }, [user, authLoading, navigate]);
  useEffect(() => { if (user) fetchItems(); }, [user]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("advertising_expenses").select("*").order("created_at", { ascending: false });
    if (error) console.error(error); else setItems((data || []) as AdExpense[]);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await (supabase as any).from("advertising_expenses").insert([formData]);
    if (error) {
      toast({ variant: "destructive", title: "エラー", description: error.message });
      return;
    }
    setFormData({ name: "", amount: 0, rule: "", is_active: true });
    setShowForm(false);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await (supabase as any).from("advertising_expenses").delete().eq("id", id);
    if (error) toast({ variant: "destructive", title: "エラー", description: error.message });
    else fetchItems();
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">広告費設定</h1>
              <p className="text-muted-foreground">広告費の項目・金額・ルールを管理</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}><Plus size={16} className="mr-2" />追加</Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>広告費を追加</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>項目名</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div>
                      <Label>金額（円）</Label>
                      <Input type="number" min="0" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label>ルール</Label>
                    <Textarea value={formData.rule} onChange={(e) => setFormData({ ...formData, rule: e.target.value })} placeholder="例: 毎月1日に発生 / 売上の◯%など" />
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
          ) : items.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">広告費がありません</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-sm text-muted-foreground">¥{(item.amount || 0).toLocaleString()}</div>
                        {item.rule && <div className="text-sm mt-1 whitespace-pre-wrap">{item.rule}</div>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></Button>
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
