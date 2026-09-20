import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Eye,
  FilePenLine,
  Globe2,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import {
  BLOG_CATEGORY_OPTIONS,
  PublicBlogArticle,
  blogCategoryLabel,
  blogExcerpt,
  formatBlogDate,
  isVideoUrl,
  slugifyBlogTitle,
} from "@/lib/publicBlog";

type BlogForm = {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  seo_title: string;
  seo_description: string;
  is_published: boolean;
  image_urls: string[];
};

const INITIAL_FORM: BlogForm = {
  title: "",
  slug: "",
  category: "tips",
  excerpt: "",
  content: "",
  seo_title: "",
  seo_description: "",
  is_published: false,
  image_urls: [],
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export default function HpBlogManagement() {
  const { user, loading: authLoading } = useAuth();
  const { store, storeId, loading: storeLoading } = useAdminStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [articles, setArticles] = useState<PublicBlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, navigate, user]);

  const fetchArticles = useCallback(async () => {
    if (!user || storeLoading) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("hp_articles")
      .select("id,store_id,title,slug,content,category,excerpt,seo_title,seo_description,image_urls,is_published,created_at,updated_at,published_at")
      .eq("store_id", storeId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("blog articles load failed", error);
      toast.error("ブログ記事の読み込みに失敗しました");
    }
    setArticles((data || []) as PublicBlogArticle[]);
    setLoading(false);
  }, [storeId, storeLoading, user]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const resetForm = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  const openNew = () => {
    resetForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openEdit = (article: PublicBlogArticle) => {
    setEditingId(article.id);
    setForm({
      title: article.title,
      slug: article.slug || "",
      category: article.category || "other",
      excerpt: article.excerpt || "",
      content: article.content || "",
      seo_title: article.seo_title || "",
      seo_description: article.seo_description || "",
      is_published: article.is_published,
      image_urls: article.image_urls || [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateForm = <Key extends keyof BlogForm>(key: Key, value: BlogForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleTitleChange = (title: string) => {
    setForm((current) => {
      const previousAutoSlug = slugifyBlogTitle(current.title);
      return {
        ...current,
        title,
        slug: !current.slug || current.slug === previousAutoSlug ? slugifyBlogTitle(title) : current.slug,
      };
    });
  };

  const uploadImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const invalid = files.find((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE_BYTES);
    if (invalid) {
      toast.error("画像は10MB以下の画像ファイルを選択してください");
      event.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files.slice(0, Math.max(0, 8 - form.image_urls.length))) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `blog/${storeId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from("article-images").upload(path, file, {
          cacheControl: "31536000",
          contentType: file.type,
          upsert: false,
        });
        if (error) throw error;
        uploadedUrls.push(supabase.storage.from("article-images").getPublicUrl(path).data.publicUrl);
      }
      setForm((current) => ({ ...current, image_urls: [...current.image_urls, ...uploadedUrls] }));
      toast.success(`${uploadedUrls.length}枚の画像を追加しました`);
    } catch (error) {
      console.error("blog image upload failed", error);
      toast.error("画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removeImage = (url: string) => updateForm("image_urls", form.image_urls.filter((item) => item !== url));

  const saveArticle = async () => {
    const title = form.title.trim();
    const slug = form.slug.trim().replace(/^\/+|\/+$/g, "");
    if (!title || !slug || !form.content.trim()) {
      toast.error("タイトル、URL、本文を入力してください");
      return;
    }
    if (/[/?#\s]/.test(slug)) {
      toast.error("URLには空白、/、?、#を使用できません");
      return;
    }
    setSaving(true);
    const payload = {
      title,
      slug,
      category: form.category,
      excerpt: form.excerpt.trim() || null,
      content: form.content.trim(),
      seo_title: form.seo_title.trim() || null,
      seo_description: form.seo_description.trim() || null,
      is_published: form.is_published,
      image_urls: form.image_urls,
      store_id: storeId,
    };
    const result = editingId
      ? await supabase.from("hp_articles").update(payload).eq("id", editingId).eq("store_id", storeId)
      : await supabase.from("hp_articles").insert(payload);
    setSaving(false);
    if (result.error) {
      console.error("blog article save failed", result.error);
      toast.error(result.error.code === "23505" ? "このURLはすでに使われています" : "記事を保存できませんでした");
      return;
    }
    toast.success(form.is_published ? "ブログ記事を公開しました" : "下書きを保存しました");
    resetForm();
    fetchArticles();
  };

  const togglePublish = async (article: PublicBlogArticle) => {
    const next = !article.is_published;
    const { error } = await supabase
      .from("hp_articles")
      .update({ is_published: next, ...(next ? { published_at: new Date().toISOString() } : {}) })
      .eq("id", article.id)
      .eq("store_id", storeId);
    if (error) {
      toast.error("公開状態を変更できませんでした");
      return;
    }
    toast.success(next ? "公開しました" : "下書きに戻しました");
    fetchArticles();
  };

  const deleteArticle = async (article: PublicBlogArticle) => {
    if (!window.confirm(`「${article.title}」を削除しますか？\nこの操作は元に戻せません。`)) return;
    const { error } = await supabase.from("hp_articles").delete().eq("id", article.id).eq("store_id", storeId);
    if (error) {
      toast.error("記事を削除できませんでした");
      return;
    }
    if (editingId === article.id) resetForm();
    toast.success("記事を削除しました");
    fetchArticles();
  };

  const filteredArticles = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("ja-JP");
    return articles.filter((article) => {
      if (categoryFilter !== "all" && article.category !== categoryFilter) return false;
      if (statusFilter === "published" && !article.is_published) return false;
      if (statusFilter === "draft" && article.is_published) return false;
      if (!text) return true;
      return [article.title, article.slug, article.excerpt, article.content, article.seo_title]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ja-JP")
        .includes(text);
    });
  }, [articles, categoryFilter, query, statusFilter]);

  const publicUrl = form.slug && store?.custom_domain
    ? `https://${store.custom_domain}/blog/${encodeURIComponent(form.slug)}`
    : form.slug ? `/blog/${encodeURIComponent(form.slug)}` : "";
  const titleLength = form.seo_title.trim().length;
  const descriptionLength = form.seo_description.trim().length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="p-4 pt-[76px] md:ml-[240px] md:p-7 md:pt-[84px]">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-primary">HP BLOG</p>
              <h1 className="mt-1 text-2xl font-bold">ブログ・記事管理</h1>
              <p className="mt-1 text-sm text-muted-foreground">公開URLは <span className="font-mono text-foreground">/blog/</span>。検索流入から出勤・予約へつなげる記事を管理します。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/blog" target="_blank"><Button variant="outline"><Globe2 size={16} className="mr-2" />公開ブログを見る</Button></Link>
              <Button onClick={openNew}><Plus size={16} className="mr-2" />新規記事</Button>
            </div>
          </header>

          <Card className="border-primary/25">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="flex items-center gap-2 text-lg"><FilePenLine size={19} />{editingId ? "ブログ記事を編集" : "新しいブログ記事を作成"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-4 md:grid-cols-[1fr_280px]">
                <div className="space-y-2"><Label htmlFor="blog-title">記事タイトル <span className="text-destructive">*</span></Label><Input id="blog-title" value={form.title} onChange={(event) => handleTitleChange(event.target.value)} placeholder="例：初めての方へ｜予約からご来店までの流れ" maxLength={120} /></div>
                <div className="space-y-2"><Label htmlFor="blog-category">カテゴリー</Label><Select value={form.category} onValueChange={(value) => updateForm("category", value)}><SelectTrigger id="blog-category"><SelectValue /></SelectTrigger><SelectContent>{BLOG_CATEGORY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              </div>

              <div className="space-y-2"><Label htmlFor="blog-slug">公開URL <span className="text-destructive">*</span></Label><div className="flex items-center rounded-md border bg-muted/40 px-3 focus-within:ring-2 focus-within:ring-ring"><span className="shrink-0 text-sm text-muted-foreground">/blog/</span><input id="blog-slug" value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} placeholder="first-visit-guide" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none" maxLength={160} /></div><p className="text-xs text-muted-foreground">英数字・日本語・ハイフンが利用できます。公開後の変更は検索評価に影響するため、原則として固定してください。</p></div>

              <div className="space-y-2"><Label htmlFor="blog-excerpt">記事の要約</Label><Textarea id="blog-excerpt" value={form.excerpt} onChange={(event) => updateForm("excerpt", event.target.value)} placeholder="一覧ページとSNS共有で表示する、この記事の要点を1〜2文で入力" rows={2} maxLength={220} /><p className="text-right text-xs text-muted-foreground">{form.excerpt.length}/220</p></div>

              <div className="space-y-2"><Label htmlFor="blog-content">本文 <span className="text-destructive">*</span></Label><Textarea id="blog-content" value={form.content} onChange={(event) => updateForm("content", event.target.value)} placeholder={"最初に結論を書きます。\n\n## 見出し\n本文を書きます。\n\n- 箇条書きも使えます"} rows={16} className="font-mono text-sm leading-6" /><p className="text-xs text-muted-foreground">見出しは「## 見出し」、小見出しは「### 見出し」、箇条書きは「- 内容」で入力できます。通常の改行は段落として表示されます。</p></div>

              <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><Label>アイキャッチ・本文画像</Label><span className="text-xs text-muted-foreground">最大8枚・1枚10MBまで</span></div><input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={uploadImages} /><Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || form.image_urls.length >= 8}>{uploading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}{uploading ? "アップロード中" : "画像を追加"}</Button>{form.image_urls.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{form.image_urls.map((url, index) => <div key={url} className="group relative overflow-hidden rounded-lg border bg-muted"><img src={url} alt={`記事画像${index + 1}`} className="aspect-[4/3] h-full w-full object-cover" /><button type="button" onClick={() => removeImage(url)} className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`画像${index + 1}を削除`}><X size={14} /></button>{index === 0 && <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">アイキャッチ</span>}</div>)}</div>}</div>

              <details className="rounded-xl border bg-muted/20 p-4"><summary className="cursor-pointer text-sm font-bold">検索・SNS表示の設定（SEO）</summary><div className="mt-4 grid gap-4"><div className="space-y-2"><Label htmlFor="blog-seo-title">SEOタイトル</Label><Input id="blog-seo-title" value={form.seo_title} onChange={(event) => updateForm("seo_title", event.target.value)} placeholder={form.title || "検索結果に表示するタイトル"} maxLength={70} /><p className={`text-right text-xs ${titleLength > 60 ? "text-amber-600" : "text-muted-foreground"}`}>{titleLength}/60文字目安</p></div><div className="space-y-2"><Label htmlFor="blog-seo-description">SEOディスクリプション</Label><Textarea id="blog-seo-description" value={form.seo_description} onChange={(event) => updateForm("seo_description", event.target.value)} placeholder={blogExcerpt(form.content, form.excerpt, 150) || "検索結果・SNS共有で記事内容を説明する文章"} rows={3} maxLength={180} /><p className={`text-right text-xs ${descriptionLength > 160 ? "text-amber-600" : "text-muted-foreground"}`}>{descriptionLength}/160文字目安</p></div><p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">未入力の場合、記事タイトルと要約（または本文冒頭）を自動利用します。公開記事は個別canonical、OGP、BlogPosting構造化データ、サイトマップに自動反映されます。</p></div></details>

              <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.is_published} onChange={(event) => updateForm("is_published", event.target.checked)} className="size-4" />すぐに公開する</label><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={resetForm} disabled={saving}>キャンセル</Button>{publicUrl && editingId && <a href={publicUrl} target="_blank" rel="noreferrer"><Button type="button" variant="outline"><Eye size={16} className="mr-2" />表示を確認</Button></a>}<Button type="button" onClick={saveArticle} disabled={saving}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle2 size={16} className="mr-2" />}{form.is_published ? "公開して保存" : "下書きを保存"}</Button></div></div>
            </CardContent>
          </Card>

          <section>
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold">記事一覧</h2><p className="mt-1 text-sm text-muted-foreground">公開 {articles.filter((article) => article.is_published).length}件 / 下書き {articles.filter((article) => !article.is_published).length}件</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="flex items-center rounded-md border px-3"><Search size={15} className="mr-2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・本文を検索" className="h-9 w-full bg-transparent text-sm outline-none sm:w-52" /></div><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全カテゴリー</SelectItem>{BLOG_CATEGORY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="published">公開中</SelectItem><SelectItem value="draft">下書き</SelectItem></SelectContent></Select></div></div>
            {loading ? <div className="py-16 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 animate-spin" size={20} />読み込み中…</div> : filteredArticles.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground"><CircleAlert className="mx-auto mb-3" size={24} />該当する記事はありません。</CardContent></Card> : <div className="space-y-3">{filteredArticles.map((article) => { const cover = article.image_urls?.find((url) => !isVideoUrl(url)); return <Card key={article.id}><CardContent className="flex gap-4 p-4"><div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">{cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImagePlus size={20} /></div>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-muted px-2 py-0.5">{blogCategoryLabel(article.category)}</span><span className={article.is_published ? "text-emerald-600" : "text-muted-foreground"}>{article.is_published ? "公開中" : "下書き"}</span><time className="text-muted-foreground">{formatBlogDate(article.published_at || article.created_at)}</time></div><h3 className="mt-2 truncate font-bold">{article.title}</h3><p className="mt-1 truncate text-xs text-muted-foreground">/blog/{article.slug}</p><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{blogExcerpt(article.content, article.excerpt, 145)}</p></div><div className="flex shrink-0 flex-col gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(article)}>編集</Button><Button size="sm" variant="outline" onClick={() => togglePublish(article)}>{article.is_published ? "非公開" : "公開"}</Button>{article.is_published && article.slug && <a href={`/blog/${encodeURIComponent(article.slug)}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="w-full"><Eye size={14} /></Button></a>}<Button size="sm" variant="ghost" onClick={() => deleteArticle(article)} className="text-destructive hover:text-destructive"><Trash2 size={15} /></Button></div></CardContent></Card>; })}</div>}
          </section>
        </div>
      </main>
    </div>
  );
}
