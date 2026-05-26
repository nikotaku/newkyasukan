import { useState, useEffect, useRef } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Plus, Send, Loader2, CheckCircle, XCircle, Clock, Trash2, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";

interface Cast { id: string; name: string; }
interface Post {
  id: string;
  cast_id: string;
  title: string | null;
  body: string;
  image_urls: string[] | null;
  status: string;
  posted_at: string | null;
  o2_status: string;
  esutama_status: string;
  o2_error: string | null;
  esutama_error: string | null;
  created_at: string;
  casts: { name: string };
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  draft:   { label: "下書き",  color: "bg-gray-100 text-gray-700" },
  pending: { label: "投稿待ち", color: "bg-yellow-100 text-yellow-700" },
  posted:  { label: "投稿済み", color: "bg-green-100 text-green-700" },
  failed:  { label: "失敗",    color: "bg-red-100 text-red-700" },
};
const SITE_BADGE: Record<string, JSX.Element> = {
  pending: <Clock size={12} className="text-yellow-500" />,
  posted:  <CheckCircle size={12} className="text-green-500" />,
  failed:  <XCircle size={12} className="text-red-500" />,
  skipped: <span className="text-xs text-muted-foreground">-</span>,
};

export default function CastPostManagement() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<{ cast_id: string; title: string; body: string; images: string[] }>({ cast_id: "", title: "", body: "", images: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (!authLoading && !user) navigate("/login"); }, [user, authLoading, navigate]);
  useEffect(() => { if (user) { fetchPosts(); fetchCasts(); } }, [user]);

  const fetchCasts = async () => {
    const { data } = await supabase.from("casts").select("id, name").order("display_order", { ascending: true });
    setCasts(data || []);
  };

  const fetchPosts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cast_posts")
      .select("*, casts(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    setPosts((data || []) as Post[]);
    setLoading(false);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `posts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("cast-photos").upload(path, file, { upsert: false });
      if (error) {
        toast.error(`アップロード失敗: ${file.name}`);
        continue;
      }
      const { data: { publicUrl } } = supabase.storage.from("cast-photos").getPublicUrl(path);
      urls.push(publicUrl);
    }
    setForm(prev => ({ ...prev, images: [...prev.images, ...urls] }));
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!form.cast_id || !form.body.trim()) { toast.error("セラピストと本文は必須です"); return; }
    setSubmitting(true);
    const { data, error } = await supabase.from("cast_posts").insert({
      cast_id: form.cast_id,
      title: form.title || null,
      body: form.body,
      image_urls: form.images.length > 0 ? form.images : null,
      status: "pending",
    }).select("*, casts(name)").single();
    setSubmitting(false);
    if (error) { toast.error("作成に失敗しました"); return; }
    toast.success("投稿を作成しました。自動投稿を開始します...");
    setPosts(prev => [data as Post, ...prev]);
    setShowDialog(false);
    setForm({ cast_id: "", title: "", body: "", images: [] });
    supabase.functions.invoke("post-to-sites", { body: { post_id: data.id } })
      .then(({ error }) => {
        if (error) toast.error("自動投稿に失敗しました: " + error.message);
        else fetchPosts();
      });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この投稿を削除しますか？")) return;
    const { error } = await supabase.from("cast_posts").delete().eq("id", id);
    if (error) { toast.error("削除に失敗しました"); return; }
    setPosts(prev => prev.filter(p => p.id !== id));
    toast.success("削除しました");
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 md:p-6 overflow-x-hidden">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">投稿管理</h1>
              <p className="text-sm text-muted-foreground">O2・エスたまの魂への自動投稿</p>
            </div>
            <Button onClick={() => setShowDialog(true)}>
              <Plus size={16} className="mr-1" />新規投稿
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">投稿がありません</div>
          ) : (
            <div className="space-y-2">
              {posts.map(post => {
                const s = STATUS_BADGE[post.status] ?? STATUS_BADGE.draft;
                return (
                  <div key={post.id} className="border rounded-lg p-3 bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{post.casts?.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                          {post.posted_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(post.posted_at), "M/d HH:mm", { locale: ja })}
                            </span>
                          )}
                        </div>
                        {post.title && <p className="text-sm font-medium mb-0.5">{post.title}</p>}
                        <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                        {post.image_urls && post.image_urls.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {post.image_urls.slice(0, 4).map((u, i) => (
                              <img key={i} src={u} alt="" className="w-14 h-14 rounded object-cover" />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0 text-xs">
                        <div className="flex items-center gap-1">
                          {SITE_BADGE[post.o2_status]}
                          <span className="text-muted-foreground">O2</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {SITE_BADGE[post.esutama_status]}
                          <span className="text-muted-foreground">エスたま</span>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => handleDelete(post.id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    {(post.o2_error || post.esutama_error) && (
                      <p className="text-xs text-red-500 mt-1">
                        {post.o2_error && `O2: ${post.o2_error}`}
                        {post.esutama_error && ` エスたま: ${post.esutama_error}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>新規投稿作成</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>セラピスト</Label>
              <Select value={form.cast_id} onValueChange={v => setForm({ ...form, cast_id: v })}>
                <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  {casts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>タイトル（任意）</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="タイトル" />
            </div>
            <div>
              <Label>本文</Label>
              <Textarea
                rows={5}
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="投稿内容を入力..."
              />
            </div>
            <div>
              <Label>画像</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={e => handleFileUpload(e.target.files)}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2 mt-1">
                {form.images.map((url, i) => (
                  <div key={i} className="relative w-20 h-20 group">
                    <img src={url} alt="" className="w-full h-full object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }))}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-20 h-20 border-2 border-dashed rounded flex flex-col items-center justify-center text-muted-foreground hover:bg-muted text-xs gap-1"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <><ImagePlus size={16} /><span>追加</span></>}
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting || uploading}>
                {submitting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
                {submitting ? "投稿中..." : "投稿する"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>キャンセル</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
