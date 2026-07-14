import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Upload, Download, Trash2, Images, X } from "lucide-react";

/**
 * 画像ストック：投稿・広告用などの画像を保存していつでもダウンロードできる保管庫。
 * 既存の公開バケット cast-photos の image-stock/ プレフィックス配下に保存する。
 */

const BUCKET = "cast-photos";
const PREFIX = "image-stock";

interface StockImage {
  name: string; // ストレージ上のファイル名
  url: string;
  createdAt: string | null;
  size: number | null;
}

export default function ImageStock() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [images, setImages] = useState<StockImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<StockImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => { document.title = "画像ストック"; }, []);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(PREFIX, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      const list: StockImage[] = (data || [])
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => ({
          name: f.name,
          url: supabase.storage.from(BUCKET).getPublicUrl(`${PREFIX}/${f.name}`).data.publicUrl,
          createdAt: f.created_at ?? null,
          size: (f.metadata as any)?.size ?? null,
        }));
      setImages(list);
    } catch (e) {
      console.error(e);
      toast.error("画像の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchImages();
  }, [user, fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      let ok = 0;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "png";
        // 元のファイル名を残しつつ重複を避ける
        const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w\-ぁ-んァ-ヶ一-龠ー]/g, "_").slice(0, 40);
        const name = `${Date.now()}_${base}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(`${PREFIX}/${name}`, file);
        if (error) { console.error(error); continue; }
        ok++;
      }
      if (ok > 0) {
        toast.success(`${ok}枚アップロードしました`);
        fetchImages();
      } else {
        toast.error("アップロードに失敗しました");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (img: StockImage) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(`${PREFIX}/${img.name}`);
      if (error || !data) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      // 先頭のタイムスタンプを外した名前でダウンロード
      a.download = img.name.replace(/^\d+_/, "");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("ダウンロードに失敗しました");
    }
  };

  const handleDelete = async (img: StockImage) => {
    if (!confirm("この画像を削除しますか？")) return;
    const { error } = await supabase.storage.from(BUCKET).remove([`${PREFIX}/${img.name}`]);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    setImages((prev) => prev.filter((i) => i.name !== img.name));
    if (preview?.name === img.name) setPreview(null);
    toast.success("削除しました");
  };

  const fmtSize = (size: number | null) => {
    if (!size) return "";
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
    return `${Math.round(size / 1024)}KB`;
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "";
    const dt = new Date(d);
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px]">
        <div className="container mx-auto px-4 py-6 max-w-5xl">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Images size={20} className="text-primary" />
              画像ストック
              <span className="text-sm font-normal text-muted-foreground">{images.length}枚</span>
            </h1>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Upload size={16} className="mr-1.5" />}
              {uploading ? "アップロード中..." : "画像を追加"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            投稿・広告用などの画像を保存して、いつでもダウンロードできます（複数選択OK）。HPには表示されません。
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />

          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground text-sm">
              まだ画像がありません。「画像を追加」からアップロードしてください。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((img) => (
                <div key={img.name} className="rounded-lg border bg-card overflow-hidden group">
                  <div
                    className="aspect-square bg-muted/30 cursor-pointer overflow-hidden"
                    onClick={() => setPreview(img)}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] text-muted-foreground truncate">
                      {fmtDate(img.createdAt)}{img.size ? ` · ${fmtSize(img.size)}` : ""}
                    </p>
                    <div className="flex gap-1.5 mt-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleDownload(img)}
                      >
                        <Download size={12} className="mr-1" />保存
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(img)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 拡大プレビュー */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setPreview(null)}
          >
            <X size={28} />
          </button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={preview.url} alt={preview.name} className="w-full max-h-[80vh] object-contain rounded-lg" />
            <div className="flex justify-center gap-3 mt-4">
              <Button variant="secondary" onClick={() => handleDownload(preview)}>
                <Download size={15} className="mr-1.5" />ダウンロード
              </Button>
              <Button variant="destructive" onClick={() => handleDelete(preview)}>
                <Trash2 size={15} className="mr-1.5" />削除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
