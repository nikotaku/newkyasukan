import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface BulletinPost {
  id: string;
  title: string;
  content: string;
  created_at: string;
  is_published: boolean;
}

export default function HPBulletinBoard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [posts, setPosts] = useState<BulletinPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    is_published: false,
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
      fetchPosts();
    }
  }, [user]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hp_bulletin")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching posts:", error);
      toast.error("掲示板の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("タイトルと内容を入力してください");
      return;
    }

    try {
      const { error } = await supabase.from("hp_bulletin").insert([
        {
          title: formData.title,
          content: formData.content,
          is_published: formData.is_published,
        },
      ]);

      if (error) throw error;
      toast.success("掲示板を追加しました");
      setFormData({ title: "", content: "", is_published: false });
      setIsAdding(false);
      fetchPosts();
    } catch (error) {
      console.error("Error adding post:", error);
      toast.error("追加に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    try {
      const { error } = await supabase
        .from("hp_bulletin")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("削除しました");
      fetchPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("削除に失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">HP掲示板</h1>
              <p className="text-muted-foreground">
                ホームページの掲示板を管理
              </p>
            </div>
            <Button onClick={() => setIsAdding(!isAdding)}>
              <Plus size={16} className="mr-2" />
              新規追加
            </Button>
          </div>

          {isAdding && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>新しい掲示板を作成</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">タイトル</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="掲示板のタイトル"
                  />
                </div>
                <div>
                  <Label htmlFor="content">内容</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="掲示板の内容"
                    rows={6}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="published"
                    checked={formData.is_published}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_published: e.target.checked,
                      })
                    }
                  />
                  <Label htmlFor="published">公開する</Label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAdd}>保存</Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsAdding(false)}
                  >
                    キャンセル
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              掲示板がありません
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card key={post.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{post.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          {format(new Date(post.created_at), "yyyy/MM/dd HH:mm", {
                            locale: ja,
                          })}{" "}
                          {post.is_published ? "（公開中）" : "（非公開）"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">
                      {post.content}
                    </p>
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
