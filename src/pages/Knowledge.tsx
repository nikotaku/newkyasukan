import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Search, Pin, Pencil, Trash2, BookOpen, X, ChevronRight, FolderOpen, FileText, Save, Image
} from "lucide-react";

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { key: "すべて", label: "すべて", emoji: "📋" },
  { key: "マニュアル", label: "マニュアル", emoji: "📘" },
  { key: "ルール", label: "ルール・規則", emoji: "📏" },
  { key: "清掃", label: "清掃チェック", emoji: "🧹" },
  { key: "顧客対応", label: "顧客対応", emoji: "👥" },
  { key: "トラブル", label: "トラブル対応", emoji: "⚠️" },
  { key: "SNS・媒体", label: "SNS・媒体", emoji: "📱" },
  { key: "経費・支払い", label: "経費・支払い", emoji: "💴" },
  { key: "取引先", label: "取引先", emoji: "🤝" },
  { key: "テンプレート", label: "テンプレート", emoji: "📄" },
  { key: "面談", label: "面談", emoji: "🗣️" },
  { key: "バックログ", label: "バックログ", emoji: "📌" },
  { key: "その他", label: "その他", emoji: "📂" },
];

const CATEGORY_KEYS = CATEGORIES.slice(1).map(c => c.key);

const emptyForm = { title: "", content: "", category: "マニュアル", tags: "" };

export default function Knowledge() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [selected, setSelected] = useState<Article | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchArticles(); }, []);

  const fetchArticles = async () => {
    const { data } = await supabase
      .from("knowledge_articles")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setArticles((data || []) as unknown as Article[]);
    setLoading(false);
  };

  const filtered = articles.filter(a => {
    const matchCat = activeCategory === "すべて" || a.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.tags?.some(t => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const openNew = () => {
    setSelected(null);
    setForm({ ...emptyForm, category: activeCategory === "すべて" ? "マニュアル" : activeCategory });
    setEditing(true);
  };

  const openEdit = (a: Article) => {
    setForm({ title: a.title, content: a.content, category: a.category, tags: a.tags?.join(", ") || "" });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("タイトルを入力してください"); return; }
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const payload = { title: form.title, content: form.content, category: form.category, tags, created_by: user?.id };
    let error;
    if (selected) {
      ({ error } = await supabase.from("knowledge_articles").update(payload).eq("id", selected.id));
    } else {
      ({ error } = await supabase.from("knowledge_articles").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(`保存に失敗しました: ${error.message}`); return; }
    toast.success(selected ? "更新しました" : "作成しました");
    setEditing(false);
    await fetchArticles();
    if (selected) {
      const updated = (await supabase.from("knowledge_articles").select("*").eq("id", selected.id).single()).data;
      if (updated) setSelected(updated as unknown as Article);
    } else {
      setSelected(null);
    }
  };

  const handleDelete = async (a: Article) => {
    if (!confirm(`「${a.title}」を削除しますか？`)) return;
    await supabase.from("knowledge_articles").delete().eq("id", a.id);
    toast.success("削除しました");
    if (selected?.id === a.id) setSelected(null);
    fetchArticles();
  };

  const handleTogglePin = async (a: Article, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("knowledge_articles").update({ is_pinned: !a.is_pinned }).eq("id", a.id);
    fetchArticles();
    if (selected?.id === a.id) setSelected({ ...selected, is_pinned: !a.is_pinned });
  };

  const cancelEdit = () => {
    setEditing(false);
    if (!selected) setSelected(null);
  };

  const catCount = (key: string) =>
    key === "すべて" ? articles.length : articles.filter(a => a.category === key).length;

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? form.content.length;
    const end = ta.selectionEnd ?? start;
    const newContent = form.content.slice(0, start) + text + form.content.slice(end);
    setForm(f => ({ ...f, content: newContent }));
    setTimeout(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const randomId = Math.random().toString(36).slice(2, 9);
      const path = `${Date.now()}-${randomId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("knowledge-images")
        .getPublicUrl(path);
      insertAtCursor(`\n![画像](${publicUrl})\n`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error("画像のアップロードに失敗しました: " + msg);
    } finally {
      setImageUploading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) handleImageUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
    if (file) handleImageUpload(file);
  };

  const renderContent = (content: string) => {
    if (!content) return <span className="text-muted-foreground italic">内容がありません</span>;
    const parts = content.split(/(!\[([^\]]*)\]\(([^)]+)\))/g);
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < parts.length) {
      const part = parts[i];
      if (/^!\[/.test(part)) {
        const alt = parts[i + 1] ?? "";
        const url = parts[i + 2] ?? "";
        elements.push(
          <img key={i} src={url} alt={alt} className="max-w-full rounded-lg my-3 block" />
        );
        i += 3;
      } else {
        if (part) elements.push(<span key={i} className="whitespace-pre-wrap">{part}</span>);
        i += 1;
      }
    }
    return <>{elements}</>;
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] h-[calc(100vh-60px)] flex overflow-hidden">

        {/* ── LEFT: Category nav ── */}
        <aside className="hidden md:flex flex-col w-48 shrink-0 border-r bg-muted/20 overflow-y-auto">
          <div className="p-3 border-b">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="検索..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
          </div>
          <nav className="p-2 space-y-0.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => { setActiveCategory(cat.key); setSelected(null); setEditing(false); }}
                className={`w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                  activeCategory === cat.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>{cat.emoji}</span>
                  <span className="truncate">{cat.label}</span>
                </span>
                <span className={`text-[10px] rounded-full px-1.5 ${activeCategory === cat.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/20"}`}>
                  {catCount(cat.key)}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── MIDDLE: Article list ── */}
        <div className={`flex flex-col border-r bg-background overflow-y-auto ${selected || editing ? "hidden md:flex w-64 shrink-0" : "flex-1"}`}>
          <div className="p-3 border-b flex items-center justify-between gap-2 shrink-0">
            <h1 className="font-semibold text-sm flex items-center gap-1.5">
              <BookOpen size={15} />
              {CATEGORIES.find(c => c.key === activeCategory)?.label || "ナレッジ"}
            </h1>
            {!!user && (
              <Button size="sm" className="h-7 text-xs px-2.5" onClick={openNew}>
                <Plus size={12} className="mr-1" />追加
              </Button>
            )}
          </div>

          {/* SP search */}
          <div className="md:hidden p-2 border-b">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="検索..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
            </div>
          </div>

          <div className="flex-1">
            {loading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">読み込み中...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 px-4">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">{search ? "該当する記事がありません" : "まだ記事がありません"}</p>
                {!!user && !search && (
                  <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={openNew}>
                    <Plus size={12} className="mr-1" />最初の記事を作成
                  </Button>
                )}
              </div>
            ) : (
              filtered.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setSelected(a); setEditing(false); }}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors flex items-start gap-2 ${
                    selected?.id === a.id ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {a.is_pinned ? <Pin size={12} className="text-primary" /> : <FileText size={12} className="text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{a.content}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(a.updated_at).toLocaleDateString("ja-JP")}
                      </span>
                      {a.tags?.slice(0, 2).map(t => (
                        <span key={t} className="text-[10px] bg-muted rounded px-1">{t}</span>
                      ))}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Detail / Editor ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {editing ? (
            /* ── EDITOR ── */
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
                <span className="text-sm font-semibold">{selected ? "編集" : "新規作成"}</span>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                  >
                    <Image size={12} className="mr-1" />
                    {imageUploading ? "アップロード中..." : "画像"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={cancelEdit}>キャンセル</Button>
                  <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
                    <Save size={12} className="mr-1" />{saving ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <Input
                    placeholder="タイトル"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="text-base font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 shadow-none"
                  />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <Label className="text-xs text-muted-foreground">カテゴリ</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger className="h-8 text-xs mt-0.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_KEYS.map(c => (
                          <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <Label className="text-xs text-muted-foreground">タグ（カンマ区切り）</Label>
                    <Input
                      value={form.tags}
                      onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                      placeholder="例: 重要, 新人向け"
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">本文</Label>
                  <Textarea
                    ref={textareaRef}
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="ここに内容を入力..."
                    className="mt-0.5 min-h-[calc(100vh-320px)] text-sm font-mono resize-none"
                    onPaste={handlePaste}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                </div>
              </div>
            </div>
          ) : selected ? (
            /* ── VIEWER ── */
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    className="md:hidden text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected(null)}
                  >
                    <ChevronRight size={16} className="rotate-180" />
                  </button>
                  <Badge variant="secondary" className="text-xs shrink-0">{selected.category}</Badge>
                  {selected.is_pinned && <Pin size={12} className="text-primary shrink-0" />}
                  <span className="text-xs text-muted-foreground truncate">
                    {new Date(selected.updated_at).toLocaleDateString("ja-JP")} 更新
                  </span>
                </div>
                {!!user && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={e => handleTogglePin(selected, e)}>
                      <Pin size={12} className={selected.is_pinned ? "text-primary" : ""} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(selected)}>
                      <Pencil size={12} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(selected)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-5 md:p-8">
                <h1 className="text-xl md:text-2xl font-bold mb-4">{selected.title}</h1>
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-5">
                    {selected.tags.map(t => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}
                <div className="text-sm leading-relaxed text-foreground">
                  {renderContent(selected.content)}
                </div>
              </div>
            </div>
          ) : (
            /* ── EMPTY STATE ── */
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <FolderOpen size={48} className="opacity-20" />
              <p className="text-sm">記事を選択してください</p>
              {!!user && (
                <Button variant="outline" size="sm" onClick={openNew}>
                  <Plus size={14} className="mr-1.5" />新規作成
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
