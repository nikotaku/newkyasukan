import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Trash2, Edit2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  created_at: string;
  is_published: boolean;
}

export default function ArticleCreation() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    content: "",
    category: "coupon",
    is_published: false,
  });
  const [aiInputs, setAiInputs] = useState({
    couponName: "", couponDiscount: "", couponExpiry: "", couponConditions: "",
    castName: "", scheduleDate: "", scheduleNote: "",
    staffName: "", staffProfile: "", staffMessage: "",
  });
  const [aiLoading, setAiLoading] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchArticles();
    }
  }, [user]);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hp_articles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error("Error fetching articles:", error);
      toast.error("記事の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const AI_CATEGORIES = ["coupon", "schedule", "newstaff"];

  const handleAiGenerate = async () => {
    const category = formData.category;
    if (category === "coupon" && !aiInputs.couponName) {
      toast.error("クーポン名を入力してください");
      return;
    }
    if (category === "schedule" && !aiInputs.castName) {
      toast.error("キャスト名を入力してください");
      return;
    }
    if (category === "newstaff" && !aiInputs.staffName) {
      toast.error("スタッフ名を入力してください");
      return;
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cast-content", {
        body: { type: category, ...aiInputs },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Auto-fill title if empty
      const autoTitle =
        category === "coupon" ? `${aiInputs.couponName}クーポン案内` :
        category === "schedule" ? `${aiInputs.castName}出勤情報` :
        `${aiInputs.staffName}入店のお知らせ`;
      setFormData((prev) => ({
        ...prev,
        content: data.content,
        title: prev.title || autoTitle,
      }));
      toast.success("AI生成が完了しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI生成に失敗しました");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("タイトルと内容を入力してください");
      return;
    }

    const slug = formData.slug || formData.title.toLowerCase().replace(/\s+/g, "-");

    try {
      const { error } = await supabase.from("hp_articles").insert([
        {
          title: formData.title,
          slug,
          content: formData.content,
          category: formData.category,
          is_published: formData.is_published,
        },
      ]);

      if (error) throw error;
      toast.success("記事を作成しました");
      setFormData({
        title: "",
        slug: "",
        content: "",
        category: "news",
        is_published: false,
      });
      setIsAdding(false);
      fetchArticles();
    } catch (error) {
      console.error("Error adding article:", error);
      toast.error("作成に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    try {
      const { error } = await supabase
        .from("hp_articles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("削除しました");
      fetchArticles();
    } catch (error) {
      console.error("Error deleting article:", error);
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
              <h1 className="text-2xl font-bold">記事作成</h1>
              <p className="text-muted-foreground">
                ホームページの記事を管理
              </p>
            </div>
            <Button onClick={() => setIsAdding(!isAdding)}>
              <Plus size={16} className="mr-2" />
              新規作成
            </Button>
          </div>

          {isAdding && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>新しい記事を作成</CardTitle>
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
                    placeholder="記事のタイトル"
                  />
                </div>
                <div>
                  <Label htmlFor="slug">スラッグ（URL）</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value })
                    }
                    placeholder="article-title（自動生成も可能）"
                  />
                </div>
                <div>
                  <Label htmlFor="category">カテゴリ</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coupon">クーポン案内</SelectItem>
                      <SelectItem value="schedule">出勤情報</SelectItem>
                      <SelectItem value="newstaff">新人入店情報</SelectItem>
                      <SelectItem value="news">ニュース</SelectItem>
                      <SelectItem value="tips">ノウハウ</SelectItem>
                      <SelectItem value="campaign">キャンペーン</SelectItem>
                      <SelectItem value="other">その他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* AI生成フォーム */}
                {AI_CATEGORIES.includes(formData.category) && (
                  <div className="rounded-lg border border-pink-200 bg-pink-50 p-4 space-y-3">
                    <p className="text-sm font-medium text-pink-700 flex items-center gap-1">
                      <Sparkles size={14} /> AI生成 — 情報を入力してください
                    </p>

                    {formData.category === "coupon" && (
                      <>
                        <div>
                          <Label>クーポン名 *</Label>
                          <Input
                            value={aiInputs.couponName}
                            onChange={(e) => setAiInputs({ ...aiInputs, couponName: e.target.value })}
                            placeholder="例：初回限定60分コース"
                          />
                        </div>
                        <div>
                          <Label>割引・特典内容 *</Label>
                          <Input
                            value={aiInputs.couponDiscount}
                            onChange={(e) => setAiInputs({ ...aiInputs, couponDiscount: e.target.value })}
                            placeholder="例：通常¥12,000 → ¥9,000（25%OFF）"
                          />
                        </div>
                        <div>
                          <Label>有効期限</Label>
                          <Input
                            value={aiInputs.couponExpiry}
                            onChange={(e) => setAiInputs({ ...aiInputs, couponExpiry: e.target.value })}
                            placeholder="例：〜2026年6月30日"
                          />
                        </div>
                        <div>
                          <Label>利用条件</Label>
                          <Input
                            value={aiInputs.couponConditions}
                            onChange={(e) => setAiInputs({ ...aiInputs, couponConditions: e.target.value })}
                            placeholder="例：初回ご来店限定・1回のみ利用可"
                          />
                        </div>
                      </>
                    )}

                    {formData.category === "schedule" && (
                      <>
                        <div>
                          <Label>キャスト名 *</Label>
                          <Input
                            value={aiInputs.castName}
                            onChange={(e) => setAiInputs({ ...aiInputs, castName: e.target.value })}
                            placeholder="例：さくら"
                          />
                        </div>
                        <div>
                          <Label>出勤日時 *</Label>
                          <Input
                            value={aiInputs.scheduleDate}
                            onChange={(e) => setAiInputs({ ...aiInputs, scheduleDate: e.target.value })}
                            placeholder="例：6/15（日）12:00〜22:00"
                          />
                        </div>
                        <div>
                          <Label>コメント・備考</Label>
                          <Input
                            value={aiInputs.scheduleNote}
                            onChange={(e) => setAiInputs({ ...aiInputs, scheduleNote: e.target.value })}
                            placeholder="例：久しぶりの出勤です！お気軽にご予約ください"
                          />
                        </div>
                      </>
                    )}

                    {formData.category === "newstaff" && (
                      <>
                        <div>
                          <Label>スタッフ名 *</Label>
                          <Input
                            value={aiInputs.staffName}
                            onChange={(e) => setAiInputs({ ...aiInputs, staffName: e.target.value })}
                            placeholder="例：あおい"
                          />
                        </div>
                        <div>
                          <Label>プロフィール（特徴・スペック等）</Label>
                          <Textarea
                            value={aiInputs.staffProfile}
                            onChange={(e) => setAiInputs({ ...aiInputs, staffProfile: e.target.value })}
                            placeholder="例：20歳・T163・明るく癒し系・マッサージ得意"
                            rows={2}
                          />
                        </div>
                        <div>
                          <Label>本人からのメッセージ</Label>
                          <Input
                            value={aiInputs.staffMessage}
                            onChange={(e) => setAiInputs({ ...aiInputs, staffMessage: e.target.value })}
                            placeholder="例：緊張していますが精一杯頑張ります！"
                          />
                        </div>
                      </>
                    )}

                    <Button
                      type="button"
                      onClick={handleAiGenerate}
                      disabled={aiLoading}
                      className="bg-pink-600 hover:bg-pink-700 text-white"
                    >
                      {aiLoading ? (
                        <><Loader2 size={14} className="mr-2 animate-spin" />生成中...</>
                      ) : (
                        <><Sparkles size={14} className="mr-2" />AI生成</>
                      )}
                    </Button>
                  </div>
                )}

                <div>
                  <Label htmlFor="content">内容</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="記事の内容（AI生成後に編集できます）"
                    rows={8}
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
                  <Button onClick={handleAdd}>作成</Button>
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
          ) : articles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              記事がありません
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((article) => (
                <Card key={article.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle>{article.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-2">
                          {article.slug} • {article.category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(article.created_at), "yyyy/MM/dd", {
                            locale: ja,
                          })}{" "}
                          {article.is_published ? "（公開中）" : "（下書き）"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button className="text-muted-foreground hover:text-primary transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(article.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
