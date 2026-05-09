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

interface Option {
  id: string;
  name: string;
  price: number;
  description: string;
  is_active: boolean;
}

export default function SystemOptions() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", price: 0, description: "", is_active: true });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchOptions();
  }, [user]);

  const fetchOptions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("service_options").select("*").order("price", { ascending: true });
      if (error && error.code !== "PGRST116") throw error;
      setOptions(data || []);
    } catch (error) {
      console.error("Error fetching options:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("service_options").insert([formData]);
      if (error) throw error;
      setFormData({ name: "", price: 0, description: "", is_active: true });
      setShowForm(false);
      fetchOptions();
    } catch (error) {
      console.error("Error adding option:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("service_options").delete().eq("id", id);
      if (error) throw error;
      fetchOptions();
    } catch (error) {
      console.error("Error deleting option:", error);
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
              <h1 className="text-2xl font-bold">オプション設定</h1>
              <p className="text-muted-foreground">サービスオプションの管理</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />追加
            </Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>オプションを追加</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>オプション名</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div>
                      <Label>料金</Label>
                      <Input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label>説明</Label>
                    <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
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
          ) : options.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">オプションがありません</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {options.map((option) => (
                <Card key={option.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{option.name}</div>
                        <p className="text-sm text-muted-foreground">¥{(option.price || 0).toLocaleString()}</p>
                        {option.description && <p className="text-xs text-muted-foreground mt-1">{option.description}</p>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(option.id)}>
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
