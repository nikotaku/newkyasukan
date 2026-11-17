import { useCallback, useState, useEffect } from "react";
import { AdminPageShell } from "@/components/AdminPageShell";
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
import { Plus, Trash2, Sparkles, Loader2, Globe, EyeOff, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { useAdminStore } from "@/hooks/useAdminStore";
import { AI_GENERATION_ENABLED, HP_NEWS_AI_ENABLED } from "@/lib/aiFeatures";

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  created_at: string;
  is_published: boolean;
  is_featured: boolean;
  action_url: string | null;
  image_urls: string[] | null;
  estama_status: string;
  estama_error: string | null;
  estama_news_url: string | null;
  post_to_estama?: boolean;
  post_to_o2?: boolean;
  o2_status?: string;
  o2_error?: string | null;
  o2_post_url?: string | null;
}

const REVIEW_PREFIX = "【要確認・再送停止】";

// 送り先ごとの状態の札（エステ魂・O2）。長い説明は札を押したときだけ出す
type SiteState = { label: string; tone: "ok" | "wait" | "bad" | "off"; detail: string | null; url: string | null };

function siteState(status: string | undefined, error: string | null | undefined, enabled: boolean | undefined, url: string | null | undefined): SiteState {
  if (enabled === false || status === "skipped") return { label: "出さない", tone: "off", detail: null, url: null };
  if (status === "posted") return { label: "✓ 投稿済み", tone: "ok", detail: null, url: url ?? null };
  if (status === "posting") return { label: "投稿中…", tone: "wait", detail: null, url: null };
  if (status === "review_required" || error?.startsWith(REVIEW_PREFIX)) {
    return { label: "要確認", tone: "bad", detail: error?.replace(REVIEW_PREFIX, "") ?? null, url: url ?? null };
  }
  if (status === "failed") return { label: "失敗", tone: "bad", detail: error ?? null, url: null };
  return { label: "未投稿", tone: "wait", detail: error ?? null, url: null };
}

const CATEGORY_LABELS: Record<string, string> = {
  important: "重要なお知らせ",
  event: "期間限定イベント",
  coupon: "クーポン案内",
  schedule: "出勤情報",
  newstaff: "新人入店情報",
  news: "ニュース",
  tips: "ノウハウ",
  campaign: "キャンペーン",
  other: "その他",
};

const TONE_CLASS: Record<SiteState["tone"], string> = {
  ok: "border-green-200 bg-green-50 text-green-700",
  wait: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-red-200 bg-red-50 text-red-700",
  off: "border-muted bg-muted/50 text-muted-foreground",
};

export default function ArticleCreation({ embedded = false }: { embedded?: boolean } = {}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    content: "",
    category: "coupon",
    is_published: false,
    is_featured: false,
    action_url: "",
    image_urls: [] as string[],
    post_to_estama: true,
    post_to_o2: true,
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [aiInputs, setAiInputs] = useState({
    couponName: "", couponDiscount: "", couponExpiry: "", couponConditions: "",
    castName: "", scheduleDate: "", scheduleNote: "",
    staffName: "", staffProfile: "", staffMessage: "",
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [newsMemo, setNewsMemo] = useState("");
  const [newsAiLoading, setNewsAiLoading] = useState(false);
  const [autoNewsTopic, setAutoNewsTopic] = useState("");
  const [autoNewsLoading, setAutoNewsLoading] = useState(false);
  const [estamaSyncingId, setEstamaSyncingId] = useState<string | null>(null);
  const [o2SyncingId, setO2SyncingId] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useAdminStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hp_articles")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error("Error fetching articles:", error);
      toast.error("記事の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (user && !storeLoading) {
      void fetchArticles();
    }
  }, [user, storeLoading, fetchArticles]);

  const AI_CATEGORIES = ["coupon", "schedule", "newstaff"];

  // O2の店舗アカウントへ出す（空き状況の投稿と同じアカウント）
  const publishToO2 = async (articleId: string) => {
    setO2SyncingId(articleId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("ログインが期限切れです");
      const response = await fetch("/api/automations/estama", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "store-news-o2", storeId, articleId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "O2への投稿に失敗しました");
      if (!result.skipped) toast.success("O2にも投稿しました");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "O2への投稿に失敗しました";
      toast.warning(`HPへの公開は完了しました。O2：${message}`);
      return false;
    } finally {
      setO2SyncingId(null);
    }
  };

  // HPに公開したら、記事で選んだ送り先（エステ魂・O2）へ同時に出す
  const publishToSites = async (articleId: string) => {
    await Promise.all([publishToEstama(articleId), publishToO2(articleId)]);
  };

  const publishToEstama = async (articleId: string) => {
    setEstamaSyncingId(articleId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("ログインが期限切れです");
      const response = await fetch("/api/automations/estama", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "store-news", storeId, articleId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "エステ魂への投稿に失敗しました");
      toast.success(result.skipped ? "エステ魂には投稿済みです" : "エステ魂のニュースにも投稿しました");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "エステ魂への投稿に失敗しました";
      toast.warning(`HPへの公開は完了しました。${message}`);
      return false;
    } finally {
      setEstamaSyncingId(null);
    }
  };

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
        body: { type: category, storeId, ...aiInputs },
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

  // タイトルとメモから、ニュースの本文をAIで作る（公開はしない。作った文は手で直せる）
  const handleNewsAi = async () => {
    if (!formData.title.trim() && !newsMemo.trim()) {
      toast.error("タイトルか「伝えたいこと」を入れてください");
      return;
    }
    if (formData.content.trim() && !window.confirm("今の本文をAIが作った文に置き換えますか？")) return;
    setNewsAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cast-content", {
        body: {
          type: "news",
          storeId,
          newsTitle: formData.title.trim() || undefined,
          newsMemo: newsMemo.trim() || undefined,
          newsCategory: CATEGORY_LABELS[formData.category] ?? formData.category,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.content) throw new Error("本文を作れませんでした");
      setFormData((prev) => ({ ...prev, content: data.content }));
      toast.success("本文を作りました。確認して直してから公開してください");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AIで本文を作れませんでした");
    } finally {
      setNewsAiLoading(false);
    }
  };

  // ニュースをワンクリックで自動生成して公開
  const handleAutoNews = async () => {
    setAutoNewsLoading(true);
    try {
      const topic = autoNewsTopic.trim();
      const { data, error } = await supabase.functions.invoke("generate-cast-content", {
        body: { type: "news", newsTitle: topic || undefined, storeId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.content) throw new Error("内容の生成に失敗しました");

      const title = topic || `新着ニュース ${format(new Date(), "M月d日", { locale: ja })}`;
      const slug = `news-${Date.now()}`;

      const { data: insertedArticle, error: insertError } = await supabase.from("hp_articles").insert([
        {
          store_id: storeId,
          title,
          slug,
          content: data.content,
          category: "news",
          is_published: true,
          image_urls: Array.isArray(data.images) ? data.images : [],
        },
      ]).select("id").single();
      if (insertError) throw insertError;

      toast.success("ニュースを自動生成してHPへ公開しました");
      setAutoNewsTopic("");
      await publishToSites(insertedArticle.id);
      fetchArticles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "自動投稿に失敗しました");
    } finally {
      setAutoNewsLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("article-images").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("article-images").getPublicUrl(path);
        uploaded.push(pub.publicUrl);
      }
      setFormData((prev) => ({ ...prev, image_urls: [...prev.image_urls, ...uploaded] }));
      toast.success(`${uploaded.length}枚アップロードしました`);
    } catch (error) {
      console.error("Image upload error:", error);
      toast.error("画像のアップロードに失敗しました");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const addImageUrl = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    setFormData((prev) => ({ ...prev, image_urls: [...prev.image_urls, url] }));
    setNewImageUrl("");
  };

  const removeImage = (idx: number) => {
    setFormData((prev) => ({ ...prev, image_urls: prev.image_urls.filter((_, i) => i !== idx) }));
  };

  const resetForm = () => {
    setFormData({ title: "", slug: "", content: "", category: "news", is_published: false, is_featured: false, action_url: "", image_urls: [], post_to_estama: true, post_to_o2: true });
    setNewImageUrl("");
  };

  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("タイトルと内容を入力してください");
      return;
    }

    if (!validArticleUrl(formData.action_url.trim())) {
      toast.error("リンクはHTTPS URLか / から始まるサイト内パスを設定してください");
      return;
    }
    const slug = formData.slug || formData.title.toLowerCase().replace(/\s+/g, "-");

    try {
      const { data: insertedArticle, error } = await supabase.from("hp_articles").insert([
        {
          store_id: storeId,
          title: formData.title,
          slug,
          content: formData.content,
          category: formData.category,
          is_published: formData.is_published,
          image_urls: formData.image_urls,
          is_featured: formData.is_featured,
          action_url: formData.action_url.trim() || null,
          post_to_estama: formData.post_to_estama,
          post_to_o2: formData.post_to_o2,
          estama_status: formData.post_to_estama ? "pending" : "skipped",
          o2_status: formData.post_to_o2 ? "pending" : "skipped",
        },
      ] as never).select("id").single();

      if (error) throw error;
      toast.success("記事を作成しました");
      if (formData.is_published) await publishToSites(insertedArticle.id);
      resetForm();
      setIsAdding(false);
      fetchArticles();
    } catch (error) {
      console.error("Error adding article:", error);
      toast.error("作成に失敗しました");
    }
  };

  const validArticleUrl = (url: string) => {
    if (!url) return true;
    if (url.startsWith("/") && !url.startsWith("//")) return /^[\/][a-zA-Z0-9/_?&=.%#-]*$/.test(url);
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
    } catch { return false; }
  };

  const toggleFeatured = async (article: Article) => {
    const { error } = await supabase.from("hp_articles").update({ is_featured: !article.is_featured } as never)
      .eq("id", article.id).eq("store_id", storeId);
    if (error) { toast.error(error.message); return; }
    toast.success(!article.is_featured ? "注目ニュースに設定しました" : "注目指定を解除しました");
    void fetchArticles();
  };

  const saveActionUrl = async (article: Article) => {
    const url = window.prompt("ニュースの予約・詳細リンク（空欄で解除）", article.action_url ?? "");
    if (url === null) return;
    const trimmed = url.trim();
    if (!validArticleUrl(trimmed)) { toast.error("HTTPSのURLまたは / から始まるサイト内パスを入力してください"); return; }
    const { error } = await supabase.from("hp_articles").update({ action_url: trimmed || null } as never)
      .eq("id", article.id).eq("store_id", storeId);
    if (error) { toast.error(error.message); return; }
    toast.success("誘導先を保存しました");
    void fetchArticles();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    try {
      const { error } = await supabase
        .from("hp_articles")
        .delete()
        .eq("id", id)
        .eq("store_id", storeId);

      if (error) throw error;
      toast.success("削除しました");
      fetchArticles();
    } catch (error) {
      console.error("Error deleting article:", error);
      toast.error("削除に失敗しました");
    }
  };

  const handleTogglePublish = async (article: Article) => {
    try {
      const { error } = await supabase
        .from("hp_articles")
        .update({ is_published: !article.is_published })
        .eq("id", article.id)
        .eq("store_id", storeId);
      if (error) throw error;
      toast.success(article.is_published ? "非公開にしました" : "公開しました");
      if (!article.is_published) await publishToSites(article.id);
      fetchArticles();
    } catch (error) {
      console.error("Error toggling publish:", error);
      toast.error("更新に失敗しました");
    }
  };

  return (
    <AdminPageShell embedded={embedded} mainClassName="p-6">
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

        {/* ニュース自動投稿（ワンクリック） */}
        {AI_GENERATION_ENABLED && <Card className="mb-6 border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-pink-700">
              <Sparkles size={18} />
              ニュース自動投稿
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              AIで記事を生成し、HPとエステ魂のニュースへ同時投稿します。テーマは任意です。
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={autoNewsTopic}
                onChange={(e) => setAutoNewsTopic(e.target.value)}
                placeholder="テーマ（任意・例：夏の新キャンペーン開始）"
                className="flex-1 bg-white"
                onKeyDown={(e) => { if (e.key === "Enter" && !autoNewsLoading) handleAutoNews(); }}
              />
              <Button
                onClick={handleAutoNews}
                disabled={autoNewsLoading}
                className="bg-pink-600 hover:bg-pink-700 text-white shrink-0"
              >
                {autoNewsLoading ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" />生成して公開中...</>
                ) : (
                  <><Sparkles size={16} className="mr-2" />ニュースを生成して公開</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>}

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
                    <SelectItem value="important">重要なお知らせ</SelectItem>
                    <SelectItem value="event">期間限定イベント</SelectItem>
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

              <div className="rounded-lg border p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={formData.is_featured} onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })} />
                  注目ニュースとして上部に表示
                </label>
                <div>
                  <Label htmlFor="action_url">予約・詳細ページへのリンク（任意）</Label>
                  <Input id="action_url" placeholder="/booking または https://..." value={formData.action_url} onChange={(e) => setFormData({ ...formData, action_url: e.target.value })} />
                </div>
              </div>

              {/* AI生成フォーム */}
              {AI_GENERATION_ENABLED && AI_CATEGORIES.includes(formData.category) && (
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

              {HP_NEWS_AI_ENABLED && (
                <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-pink-700 flex items-center gap-1">
                    <Sparkles size={14} /> AIで本文を作る
                  </p>
                  <Textarea
                    value={newsMemo}
                    onChange={(e) => setNewsMemo(e.target.value)}
                    rows={3}
                    className="bg-white"
                    placeholder="伝えたいこと（任意）例：りりか&ももか 本日満枠。明日は残り1名様ご案内可能"
                  />
                  <p className="text-xs text-muted-foreground">タイトル・伝えたいこと・今日の出勤と割引をもとに本文を作ります。公開はしないので、確認して直してから保存してください。</p>
                  <Button type="button" size="sm" onClick={() => void handleNewsAi()} disabled={newsAiLoading} className="bg-pink-600 hover:bg-pink-700 text-white">
                    {newsAiLoading ? <><Loader2 size={14} className="mr-2 animate-spin" />作成中...</> : <><Sparkles size={14} className="mr-2" />本文を作る</>}
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
                  placeholder={AI_GENERATION_ENABLED ? "記事の内容（AI生成後に編集できます）" : "記事の内容"}
                  rows={8}
                />
              </div>
              {/* 画像 */}
              <div>
                <Label>画像</Label>
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed cursor-pointer text-sm hover:bg-accent transition-colors">
                      {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                      {uploadingImage ? "アップロード中..." : "画像をアップロード"}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="または画像URLを貼り付け"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImageUrl(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addImageUrl} disabled={!newImageUrl.trim()}>
                      <Plus size={16} />
                    </Button>
                  </div>
                  {formData.image_urls.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {formData.image_urls.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-md overflow-hidden border bg-muted">
                          <img src={url} alt={`画像${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">公開したら、ここで選んだ所にも同時に出します</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.post_to_estama} onChange={(e) => setFormData({ ...formData, post_to_estama: e.target.checked })} />
                  エステ魂のニュースにも出す
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.post_to_o2} onChange={(e) => setFormData({ ...formData, post_to_o2: e.target.checked })} />
                  O2（店舗アカウント）にも出す
                </label>
                {formData.post_to_o2 && formData.image_urls.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">画像が無いときは、O2にはお店の画像（HPのトップバナー）を付けて出します</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAdd}>作成</Button>
                <Button
                  variant="outline"
                  onClick={() => { setIsAdding(false); resetForm(); }}
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
          <div className="space-y-3">
            {articles.map((article) => {
              const sites = [
                {
                  key: "estama",
                  name: "エステ魂",
                  state: siteState(article.estama_status, article.estama_error, article.post_to_estama, article.estama_news_url),
                  syncing: estamaSyncingId === article.id,
                  resend: () => publishToEstama(article.id),
                },
                {
                  key: "o2",
                  name: "O2",
                  state: siteState(article.o2_status, article.o2_error, article.post_to_o2, article.o2_post_url),
                  syncing: o2SyncingId === article.id,
                  resend: () => publishToO2(article.id),
                },
              ];
              const detail = sites.find((site) => openDetail === `${article.id}:${site.key}`);
              return (
                <Card key={article.id} className="overflow-hidden">
                  <CardContent className="p-3 sm:p-4 space-y-3">
                    <div className="flex gap-3">
                      {article.image_urls && article.image_urls.length > 0 ? (
                        <img src={article.image_urls[0]} alt="" className="h-16 w-16 shrink-0 rounded-md border object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
                          {article.is_featured && <span className="mr-1 text-pink-600">★</span>}
                          {article.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(article.created_at), "yyyy/MM/dd", { locale: ja })}
                          {article.image_urls && article.image_urls.length > 0 ? `・画像${article.image_urls.length}枚` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`rounded-full border px-2 py-0.5 ${article.is_published ? TONE_CLASS.ok : TONE_CLASS.off}`}>
                        HP {article.is_published ? "公開中" : "下書き"}
                      </span>
                      {article.is_published && sites.map((site) => (
                        <button
                          key={site.key}
                          type="button"
                          onClick={() => setOpenDetail(openDetail === `${article.id}:${site.key}` ? null : `${article.id}:${site.key}`)}
                          className={`rounded-full border px-2 py-0.5 ${TONE_CLASS[site.state.tone]}`}
                        >
                          {site.name} {site.syncing ? "送信中…" : site.state.label}
                        </button>
                      ))}
                    </div>

                    {detail && (
                      <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-2">
                        {detail.state.detail && <p className="break-words text-muted-foreground">{detail.state.detail}</p>}
                        <div className="flex flex-wrap gap-2">
                          {detail.state.url && (
                            <a href={detail.state.url} target="_blank" rel="noreferrer" className="text-primary underline">{detail.name}で見る</a>
                          )}
                          {(detail.state.tone === "bad" || detail.state.label === "未投稿") && detail.state.label !== "要確認" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={detail.syncing}
                              onClick={async () => { await detail.resend(); fetchArticles(); }}
                            >
                              {detail.syncing ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}{detail.name}に送り直す
                            </Button>
                          )}
                          {detail.state.label === "要確認" && (
                            <span className="text-muted-foreground">{detail.name}の管理画面で載っているか確かめてください（二重投稿を防ぐため自動では送り直しません）</span>
                          )}
                          {!detail.state.detail && !detail.state.url && detail.state.tone === "off" && (
                            <span className="text-muted-foreground">この記事は{detail.name}には出さない設定です</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1 border-t pt-2">
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void toggleFeatured(article)} title={article.is_featured ? "注目指定を解除" : "注目ニュースに設定"}>
                        <span className={article.is_featured ? "text-pink-600" : "text-muted-foreground"}>★</span><span className="ml-1">注目</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void saveActionUrl(article)}>リンク</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-8 px-2 text-xs ${article.is_published ? "text-green-600" : "text-muted-foreground"}`}
                        onClick={() => handleTogglePublish(article)}
                        title={article.is_published ? "非公開にする" : "公開する"}
                      >
                        {article.is_published ? <Globe size={15} className="mr-1" /> : <EyeOff size={15} className="mr-1" />}
                        {article.is_published ? "公開中" : "公開する"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(article.id)} aria-label="削除">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
