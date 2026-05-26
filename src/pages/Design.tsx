import { useState, useEffect, useRef } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Trash2, ChevronUp, ChevronDown, Loader2, ExternalLink, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface Banner {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
}

export default function Design() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchBanners();
  }, [user]);

  const fetchBanners = async () => {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) {
      toast.error("バナー取得エラー: " + error.message);
    } else {
      setBanners(data || []);
    }
    setLoading(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `banner_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("banners")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("banners").getPublicUrl(path);
      const imageUrl = urlData.publicUrl;

      const maxOrder = banners.reduce((m, b) => Math.max(m, b.display_order), 0);
      const { error: insertError } = await supabase.from("banners").insert({
        title: newTitle || null,
        image_url: imageUrl,
        link_url: newLinkUrl || null,
        display_order: maxOrder + 1,
        is_active: true,
      });
      if (insertError) throw insertError;

      toast.success("バナーを追加しました");
      setNewTitle("");
      setNewLinkUrl("");
      await fetchBanners();
    } catch (e: any) {
      toast.error("エラー: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (banner: Banner) => {
    const { error } = await supabase
      .from("banners")
      .update({ is_active: !banner.is_active })
      .eq("id", banner.id);
    if (error) {
      toast.error(error.message);
    } else {
      setBanners((prev) =>
        prev.map((b) => (b.id === banner.id ? { ...b, is_active: !b.is_active } : b))
      );
    }
  };

  const deleteBanner = async (banner: Banner) => {
    if (!confirm(`「${banner.title || "このバナー"}」を削除しますか？`)) return;

    // Storage から削除（URLからパスを抽出）
    const path = banner.image_url.split("/banners/").pop();
    if (path) {
      await supabase.storage.from("banners").remove([path]);
    }

    const { error } = await supabase.from("banners").delete().eq("id", banner.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("削除しました");
      await fetchBanners();
    }
  };

  const moveOrder = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= banners.length) return;

    const a = banners[index];
    const b = banners[swapIndex];
    await Promise.all([
      supabase.from("banners").update({ display_order: b.display_order }).eq("id", a.id),
      supabase.from("banners").update({ display_order: a.display_order }).eq("id", b.id),
    ]);
    await fetchBanners();
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">バナー管理</h1>
          <p className="text-muted-foreground text-sm mb-8">
            トップページのスライダー画像を管理します
          </p>

          {/* 新規追加 */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus size={16} />
                新しいバナーを追加
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>タイトル（任意）</Label>
                  <Input
                    placeholder="例: キャンペーンバナー"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>リンク先URL（任意）</Label>
                  <Input
                    placeholder="https://..."
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => !uploading && fileRef.current?.click()}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 size={20} className="animate-spin" />
                    <span>アップロード中...</span>
                  </div>
                ) : (
                  <>
                    <Upload size={28} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">クリックして画像を選択</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG / JPG / WebP</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* バナー一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">現在のバナー（{banners.length}件）</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
              ) : banners.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  バナーがまだありません。上から追加してください。
                </p>
              ) : (
                <div className="space-y-3">
                  {banners.map((banner, index) => (
                    <div
                      key={banner.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${banner.is_active ? "bg-background" : "bg-muted/30 opacity-60"}`}
                    >
                      {/* 画像プレビュー */}
                      <div className="w-24 h-14 rounded overflow-hidden bg-muted shrink-0">
                        <img
                          src={banner.image_url}
                          alt={banner.title || "バナー"}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* 情報 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {banner.title || <span className="text-muted-foreground">無題</span>}
                        </p>
                        {banner.link_url && (
                          <a
                            href={banner.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 truncate"
                          >
                            <ExternalLink size={10} />
                            {banner.link_url}
                          </a>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          表示順: {banner.display_order}
                        </p>
                      </div>

                      {/* 表示ON/OFF */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">表示</span>
                        <Switch
                          checked={banner.is_active}
                          onCheckedChange={() => toggleActive(banner)}
                        />
                      </div>

                      {/* 並び替え */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0}
                          onClick={() => moveOrder(index, "up")}
                        >
                          <ChevronUp size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === banners.length - 1}
                          onClick={() => moveOrder(index, "down")}
                        >
                          <ChevronDown size={14} />
                        </Button>
                      </div>

                      {/* 削除 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => deleteBanner(banner)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
