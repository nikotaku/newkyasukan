import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { driveImgUrl } from "@/lib/drive";
import { ArrowDown, ArrowUp, GripVertical, Image as ImageIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";

interface Banner {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
}

const BUCKET = "banner-images";

/**
 * キャンペーン・おすすめメニューのバナー（banners 表）。
 * WEB予約ページの「おすすめメニュー」タブと、キャンペーンページ（/campaigns）に出る。トップページのバナー（stores.settings.hero_banners）とは別。
 * ホームページダッシュボードの「バナー」タブ（トップページバナーの下）に置く。変えるとすぐ反映（保存ボタンなし）。
 */
export function BannerManagement() {
  const { storeId, loading: storeLoading } = useAdminStore();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBanner, setNewBanner] = useState({ title: "", image_url: "", link_url: "" });
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const dragId = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchBanners = useCallback(async () => {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .eq("store_id", storeId)
      .order("display_order", { ascending: true });
    if (error) toast({ title: "バナーを読み込めませんでした", description: error.message, variant: "destructive" });
    else setBanners((data ?? []) as Banner[]);
    setLoading(false);
  }, [storeId, toast]);

  useEffect(() => {
    if (storeLoading) return;
    void fetchBanners();
  }, [storeLoading, fetchBanners]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "PNG・JPG・WebP などの画像を選んでください", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `campaign-banners/${storeId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setNewBanner((b) => ({ ...b, image_url: publicUrl }));
      toast({ title: "画像を入れました。「追加」を押すと公開されます" });
    } catch (err) {
      console.error(err);
      toast({ title: "アップロードに失敗しました", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = async () => {
    if (!newBanner.image_url.trim()) {
      toast({ title: "画像を選ぶか、画像のURLを入れてください", variant: "destructive" });
      return;
    }
    setAdding(true);
    const maxOrder = banners.reduce((m, b) => Math.max(m, b.display_order), 0);
    const { error } = await supabase.from("banners").insert({
      store_id: storeId,
      title: newBanner.title.trim() || null,
      image_url: newBanner.image_url.trim(),
      link_url: newBanner.link_url.trim() || null,
      display_order: maxOrder + 1,
      is_active: true,
    });
    setAdding(false);
    if (error) {
      toast({ title: "追加できませんでした", description: error.message, variant: "destructive" });
      return;
    }
    setNewBanner({ title: "", image_url: "", link_url: "" });
    toast({ title: "バナーを追加しました" });
    void fetchBanners();
  };

  const handleUpdate = async (id: string, patch: Partial<Banner>) => {
    const { error } = await supabase.from("banners").update(patch).eq("id", id);
    if (error) {
      toast({ title: "変更できませんでした", description: error.message, variant: "destructive" });
    }
    void fetchBanners();
  };

  const handleDelete = async (banner: Banner) => {
    if (!window.confirm(`「${banner.title || "このバナー"}」を消しますか？`)) return;
    const { error } = await supabase.from("banners").delete().eq("id", banner.id);
    if (error) {
      toast({ title: "消せませんでした", description: error.message, variant: "destructive" });
      return;
    }
    // ここで上げた画像なら置き場所からも消す（他の場所の画像は触らない）
    const marker = `/${BUCKET}/`;
    const at = banner.image_url.indexOf(marker);
    if (at >= 0 && banner.image_url.includes("/storage/v1/object/public/")) {
      await supabase.storage.from(BUCKET).remove([banner.image_url.slice(at + marker.length)]);
    }
    toast({ title: "消しました" });
    void fetchBanners();
  };

  const saveOrder = async (reordered: Banner[]) => {
    setBanners(reordered);
    const results = await Promise.all(
      reordered.map((b, i) => supabase.from("banners").update({ display_order: i + 1 }).eq("id", b.id)),
    );
    if (results.some((r) => r.error)) toast({ title: "並び順を保存できませんでした", variant: "destructive" });
    void fetchBanners();
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    const reordered = [...banners];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void saveOrder(reordered);
  };

  const handleDrop = (targetId: string) => {
    const fromIdx = banners.findIndex((b) => b.id === dragId.current);
    const toIdx = banners.findIndex((b) => b.id === targetId);
    dragId.current = null;
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const reordered = [...banners];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    void saveOrder(reordered);
  };

  const editLocal = (id: string, patch: Partial<Banner>) =>
    setBanners((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="h-5 w-5" /> キャンペーン・おすすめメニューのバナー
        </CardTitle>
        <CardDescription>
          WEB予約ページの「おすすめメニュー」と、キャンペーンページ（/campaigns）に出るバナーです。トップページのバナー（上）とは別です。
          ここは保存ボタンが無く、追加・表示の切り替え・並べ替え・削除はその場で反映されます（タイトル・URLは入力欄から離れたときに保存）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <h4 className="text-sm font-medium">バナーを追加</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">タイトル（任意）</Label>
              <Input value={newBanner.title} onChange={(e) => setNewBanner({ ...newBanner, title: e.target.value })} placeholder="例：11月の限定キャンペーン" />
            </div>
            <div>
              <Label className="text-xs">押したときに開くURL（任意）</Label>
              <Input value={newBanner.link_url} onChange={(e) => setNewBanner({ ...newBanner, link_url: e.target.value })} placeholder="https://... または /booking" />
            </div>
          </div>
          <div>
            <Label className="text-xs">画像</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={() => fileInputRef.current?.click()} disabled={uploading || storeLoading}>
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              {uploading ? "アップロード中..." : "画像ファイルを選ぶ"}
            </Button>
            <Input value={newBanner.image_url} onChange={(e) => setNewBanner({ ...newBanner, image_url: e.target.value })} placeholder="または画像のURL（GoogleドライブのURLも可）" />
            {newBanner.image_url && (
              <img src={driveImgUrl(newBanner.image_url)} alt="追加するバナー" className="mt-2 max-h-24 max-w-full rounded border object-contain" />
            )}
          </div>
          <Button onClick={() => void handleAdd()} size="sm" disabled={!newBanner.image_url.trim() || adding || uploading}>
            {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} 追加
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : banners.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">バナーが登録されていません</p>
        ) : (
          <div className="space-y-2">
            {banners.map((b, index) => (
              <div
                key={b.id}
                draggable
                onDragStart={() => (dragId.current = b.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(b.id)}
                className={`space-y-2 rounded-lg border bg-card p-3 ${b.is_active ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-1 hidden h-5 w-5 flex-shrink-0 cursor-move text-muted-foreground sm:block" aria-label="ドラッグして並び替え" />
                  <img src={driveImgUrl(b.image_url)} alt={b.title || "バナー"} className="h-14 w-28 flex-shrink-0 rounded border object-cover" />
                  <div className="ml-auto flex flex-shrink-0 items-center gap-1">
                    <label className="mr-1 flex items-center gap-1.5 text-xs">
                      <Switch checked={b.is_active} onCheckedChange={(v) => void handleUpdate(b.id, { is_active: v })} aria-label="表示" />
                      表示
                    </label>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上へ">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={index === banners.length - 1} onClick={() => move(index, 1)} aria-label="下へ">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={() => void handleDelete(b)} aria-label="消す">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    value={b.title || ""}
                    placeholder="タイトル"
                    className="h-8 text-sm"
                    onChange={(e) => editLocal(b.id, { title: e.target.value })}
                    onBlur={(e) => void handleUpdate(b.id, { title: e.target.value.trim() || null })}
                  />
                  <Input
                    value={b.link_url || ""}
                    placeholder="押したときに開くURL"
                    className="h-8 text-xs"
                    onChange={(e) => editLocal(b.id, { link_url: e.target.value })}
                    onBlur={(e) => void handleUpdate(b.id, { link_url: e.target.value.trim() || null })}
                  />
                  <Input
                    value={b.image_url || ""}
                    placeholder="画像のURL"
                    className="h-8 text-xs"
                    onChange={(e) => editLocal(b.id, { image_url: e.target.value })}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value) void handleUpdate(b.id, { image_url: value });
                      else void fetchBanners();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
