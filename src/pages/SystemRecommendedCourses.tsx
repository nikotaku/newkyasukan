import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface RecommendedCourse {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  interval_posts: number;
  display_order: number;
}

const EMPTY: Omit<RecommendedCourse, "id"> = {
  title: "",
  description: "",
  image_url: "",
  link_url: "",
  is_active: true,
  interval_posts: 5,
  display_order: 0,
};

export default function SystemRecommendedCourses() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<RecommendedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recommended_courses")
      .select("*")
      .order("display_order")
      .order("created_at");
    if (error) toast.error(error.message);
    setItems((data as RecommendedCourse[]) || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.title.trim()) { toast.error("タイトルを入力してください"); return; }
    const { error } = await supabase.from("recommended_courses").insert([form]);
    if (error) return toast.error(error.message);
    toast.success("追加しました");
    setForm({ ...EMPTY });
    setShowForm(false);
    fetchAll();
  };

  const handleUpdate = async (id: string, patch: Partial<RecommendedCourse>) => {
    const { error } = await supabase.from("recommended_courses").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await supabase.from("recommended_courses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("削除しました");
    fetchAll();
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 p-4 md:p-8 max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">おすすめコース</h1>
              <p className="text-sm text-muted-foreground mt-1">
                トップページのタイムラインに差し込まれる宣伝枠。表示間隔（何投稿ごとに出すか）も設定できます。
              </p>
            </div>
            <Button onClick={() => setShowForm((v) => !v)} size="sm">
              <Plus className="w-4 h-4 mr-1" />新規
            </Button>
          </div>

          {showForm && (
            <Card className="mb-4">
              <CardHeader><CardTitle className="text-base">新規追加</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>タイトル</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="60分コース 9,000円" />
                </div>
                <div>
                  <Label>説明</Label>
                  <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="🌸 春のキャンペーン実施中！" rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>画像URL（任意）</Label>
                    <Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
                  </div>
                  <div>
                    <Label>リンクURL（任意）</Label>
                    <Input value={form.link_url ?? ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="/pricing" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>表示間隔（投稿）</Label>
                    <Input type="number" min={1} value={form.interval_posts} onChange={(e) => setForm({ ...form, interval_posts: Math.max(1, Number(e.target.value) || 1) })} />
                    <p className="text-xs text-muted-foreground mt-1">N投稿ごとに1回挿入</p>
                  </div>
                  <div>
                    <Label>表示順</Label>
                    <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>有効</Label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAdd}><Save className="w-4 h-4 mr-1" />保存</Button>
                  <Button variant="ghost" onClick={() => { setShowForm(false); setForm({ ...EMPTY }); }}>キャンセル</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground">読み込み中…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">まだ登録がありません</div>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <Card key={it.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Input
                        className="font-semibold"
                        value={it.title}
                        onChange={(e) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, title: e.target.value } : x))}
                        onBlur={(e) => handleUpdate(it.id, { title: e.target.value })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(it.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="説明"
                      value={it.description ?? ""}
                      onChange={(e) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, description: e.target.value } : x))}
                      onBlur={(e) => handleUpdate(it.id, { description: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="画像URL"
                        value={it.image_url ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, image_url: e.target.value } : x))}
                        onBlur={(e) => handleUpdate(it.id, { image_url: e.target.value })}
                      />
                      <Input
                        placeholder="リンクURL"
                        value={it.link_url ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, link_url: e.target.value } : x))}
                        onBlur={(e) => handleUpdate(it.id, { link_url: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <Label className="text-xs">表示間隔（投稿）</Label>
                        <Input
                          type="number"
                          min={1}
                          value={it.interval_posts}
                          onChange={(e) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, interval_posts: Math.max(1, Number(e.target.value) || 1) } : x))}
                          onBlur={(e) => handleUpdate(it.id, { interval_posts: it.interval_posts })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">表示順</Label>
                        <Input
                          type="number"
                          value={it.display_order}
                          onChange={(e) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, display_order: Number(e.target.value) || 0 } : x))}
                          onBlur={(e) => handleUpdate(it.id, { display_order: it.display_order })}
                        />
                      </div>
                      <div className="flex items-center gap-2 pb-2">
                        <Switch checked={it.is_active} onCheckedChange={(v) => handleUpdate(it.id, { is_active: v })} />
                        <Label className="text-xs">有効</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
