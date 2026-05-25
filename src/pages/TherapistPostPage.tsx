import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, Send, CheckCircle, XCircle, Clock, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Post {
  id: string;
  title: string | null;
  body: string;
  status: string;
  o2_status: string;
  esutama_status: string;
  o2_error: string | null;
  esutama_error: string | null;
  created_at: string;
}
interface Credential { site: string; login_id: string; }

const SITE_ICON: Record<string, JSX.Element> = {
  pending: <Clock size={13} className="text-yellow-500" />,
  posted:  <CheckCircle size={13} className="text-green-500" />,
  failed:  <XCircle size={13} className="text-red-500" />,
  skipped: <span className="text-xs text-muted-foreground">-</span>,
};

export default function TherapistPostPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [castId, setCastId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [showPost, setShowPost] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", image_urls: "" });
  const [credForm, setCredForm] = useState({ o2_id: "", o2_pw: "", esutama_id: "", esutama_pw: "" });

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    supabase.rpc("get_cast_by_access_token", { p_token: token }).then(({ data, error }) => {
      if (error || !data) { toast.error("無効なリンクです"); navigate("/"); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { navigate("/"); return; }
      setCastId(row.id);
      fetchPosts(row.id);
      fetchCreds(row.id);
      setLoading(false);
    });
  }, [token]);

  const fetchPosts = async (id: string) => {
    const { data } = await supabase
      .from("cast_posts")
      .select("id, title, body, status, o2_status, esutama_status, o2_error, esutama_error, created_at")
      .eq("cast_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    setPosts((data || []) as Post[]);
  };

  const fetchCreds = async (id: string) => {
    const { data } = await supabase
      .from("cast_site_credentials")
      .select("site, login_id")
      .eq("cast_id", id);
    setCreds((data || []) as Credential[]);
  };

  const handlePost = async () => {
    if (!castId || !form.body.trim()) { toast.error("本文を入力してください"); return; }
    setSubmitting(true);
    const imageUrls = form.image_urls.split("\n").map(s => s.trim()).filter(Boolean);
    const { data, error } = await supabase.from("cast_posts").insert({
      cast_id: castId,
      title: form.title || null,
      body: form.body,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      status: "pending",
    }).select().single();
    if (error) { toast.error("投稿に失敗しました"); setSubmitting(false); return; }
    toast.success("投稿しました。自動投稿を開始します...");
    setForm({ title: "", body: "", image_urls: "" });
    setShowPost(false);
    fetchPosts(castId);
    supabase.functions.invoke("post-to-sites", { body: { post_id: data.id } })
      .then(() => fetchPosts(castId));
    setSubmitting(false);
  };

  const handleSaveCreds = async () => {
    if (!castId) return;
    setSubmitting(true);
    const upserts = [
      { cast_id: castId, site: "o2", login_id: credForm.o2_id, password: credForm.o2_pw },
      { cast_id: castId, site: "esutama", login_id: credForm.esutama_id, password: credForm.esutama_pw },
    ].filter(c => c.login_id && c.password);
    for (const c of upserts) {
      await supabase.from("cast_site_credentials").upsert(c, { onConflict: "cast_id,site" });
    }
    toast.success("ログイン情報を保存しました");
    setShowCreds(false);
    setSubmitting(false);
    if (castId) fetchCreds(castId);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const o2Cred = creds.find(c => c.site === "o2");
  const esutamaCred = creds.find(c => c.site === "esutama");

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(`/therapist/${token}`)} className="text-primary flex items-center gap-1 text-sm">
            <ChevronLeft size={18} />戻る
          </button>
          <div className="flex-1">
            <p className="font-bold text-base">投稿管理</p>
            <p className="text-xs text-muted-foreground">O2・エスたまの魂への投稿</p>
          </div>
          <button onClick={() => setShowCreds(true)} className="text-muted-foreground hover:text-foreground">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-2xl space-y-3">
        {/* ログイン情報の状態 */}
        <div className="flex gap-2">
          <div className={`flex-1 text-xs p-2 rounded border text-center ${o2Cred ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            O2: {o2Cred ? "✓ 設定済み" : "未設定"}
          </div>
          <div className={`flex-1 text-xs p-2 rounded border text-center ${esutamaCred ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            エスたま: {esutamaCred ? "✓ 設定済み" : "未設定"}
          </div>
        </div>

        {(!o2Cred || !esutamaCred) && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            右上の⚙️ からO2とエスたまの魂のログイン情報を登録してください（初回のみ）
          </div>
        )}

        {/* 投稿一覧 */}
        {posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">投稿がありません</div>
        ) : (
          <div className="space-y-2">
            {posts.map(post => (
              <div key={post.id} className="border rounded-lg p-3 bg-card">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {post.title && <p className="text-sm font-semibold mb-0.5">{post.title}</p>}
                    <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(post.created_at), "M/d HH:mm", { locale: ja })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end text-xs shrink-0">
                    <div className="flex items-center gap-1">{SITE_ICON[post.o2_status]}<span className="text-muted-foreground">O2</span></div>
                    <div className="flex items-center gap-1">{SITE_ICON[post.esutama_status]}<span className="text-muted-foreground">エスたま</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 投稿ボタン */}
      <div className="fixed bottom-4 right-4">
        <Button onClick={() => setShowPost(true)} className="rounded-full h-14 w-14 shadow-lg p-0">
          <Send size={20} />
        </Button>
      </div>

      {/* 投稿ダイアログ */}
      <Dialog open={showPost} onOpenChange={setShowPost}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>投稿する</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>タイトル（任意）</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="タイトル" />
            </div>
            <div>
              <Label>本文</Label>
              <Textarea rows={6} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="投稿内容..." />
            </div>
            <div>
              <Label>画像URL（1行1URL）</Label>
              <Textarea rows={2} value={form.image_urls} onChange={e => setForm({ ...form, image_urls: e.target.value })} placeholder="https://..." />
            </div>
            <Button className="w-full" onClick={handlePost} disabled={submitting}>
              {submitting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
              O2・エスたまに投稿
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ログイン情報ダイアログ */}
      <Dialog open={showCreds} onOpenChange={setShowCreds}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>サイトログイン情報（初回設定）</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-sm font-semibold mb-2">O2 Health</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">ログインID</Label>
                  <Input value={credForm.o2_id} onChange={e => setCredForm({ ...credForm, o2_id: e.target.value })} placeholder="ID" />
                </div>
                <div>
                  <Label className="text-xs">パスワード</Label>
                  <Input type="password" value={credForm.o2_pw} onChange={e => setCredForm({ ...credForm, o2_pw: e.target.value })} placeholder="password" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">エスたまの魂</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">ログインID</Label>
                  <Input value={credForm.esutama_id} onChange={e => setCredForm({ ...credForm, esutama_id: e.target.value })} placeholder="ID" />
                </div>
                <div>
                  <Label className="text-xs">パスワード</Label>
                  <Input type="password" value={credForm.esutama_pw} onChange={e => setCredForm({ ...credForm, esutama_pw: e.target.value })} placeholder="password" />
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveCreds} disabled={submitting}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
