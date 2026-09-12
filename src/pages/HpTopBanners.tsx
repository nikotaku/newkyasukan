import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Info,
  Loader2,
  Save,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface HeroVideoSettings {
  enabled: boolean;
  url: string;
  poster_url: string;
}

interface StoreSettings extends Record<string, Json | undefined> {
  hero_banners?: string[];
  hero_video?: Partial<HeroVideoSettings>;
}

const DEFAULT_HERO_VIDEO: HeroVideoSettings = {
  enabled: true,
  url: "https://kayama-noa-video.saito-crow.chatgpt.site/kayama-noa-banner.mp4",
  poster_url: "https://kayama-noa-video.saito-crow.chatgpt.site/og.png",
};

const isImageFile = (file: File) => file.type.startsWith("image/");

export default function HpTopBanners() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banners, setBanners] = useState<string[]>([]);
  const [newBannerUrl, setNewBannerUrl] = useState("");
  const [heroVideo, setHeroVideo] = useState<HeroVideoSettings>(DEFAULT_HERO_VIDEO);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({});
  const [storeName, setStoreName] = useState("店舗");
  const [customDomain, setCustomDomain] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useAdminStore();

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return customDomain ? `https://${customDomain}` : window.location.origin;
  }, [customDomain]);

  useEffect(() => {
    if (!authLoading && !user) window.location.assign("/login");
  }, [authLoading, user]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stores")
      .select("name, custom_domain, settings")
      .eq("id", storeId)
      .maybeSingle();

    if (error || !data) {
      console.error("Error loading homepage banner settings:", error);
      toast.error("トップバナー設定の読み込みに失敗しました");
      setLoading(false);
      return;
    }

    const settings = (data.settings ?? {}) as StoreSettings;
    const configuredBanners = Array.isArray(settings.hero_banners)
      ? settings.hero_banners.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    const configuredVideo = settings.hero_video && typeof settings.hero_video === "object"
      ? settings.hero_video
      : {};

    setStoreSettings(settings);
    setStoreName(data.name);
    setCustomDomain(data.custom_domain);
    setBanners(configuredBanners);
    setHeroVideo({
      enabled: configuredVideo.enabled !== false,
      url: typeof configuredVideo.url === "string" ? configuredVideo.url : DEFAULT_HERO_VIDEO.url,
      poster_url: typeof configuredVideo.poster_url === "string" ? configuredVideo.poster_url : DEFAULT_HERO_VIDEO.poster_url,
    });
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (!user || storeLoading) return;
    void loadSettings();
  }, [user, storeLoading, loadSettings]);

  const addBannerUrl = (url: string) => {
    const cleaned = url.trim();
    if (!cleaned) return;
    if (!/^https?:\/\//i.test(cleaned)) {
      toast.error("画像URLは https:// または http:// で始めてください");
      return;
    }
    if (banners.includes(cleaned)) {
      toast.message("このバナーはすでに追加されています");
      return;
    }
    setBanners((current) => [...current, cleaned]);
    setNewBannerUrl("");
  };

  const uploadBanner = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isImageFile(file)) {
      toast.error("PNG、JPG、WebPなどの画像ファイルを選択してください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("画像は10MB以下にしてください");
      return;
    }

    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `hero-banners/${storeId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("banners")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("banners").getPublicUrl(path);
      setBanners((current) => [...current, data.publicUrl]);
      toast.success("バナーを追加しました。保存するとトップページへ反映されます");
    } catch (error) {
      console.error("Error uploading homepage banner:", error);
      toast.error(error instanceof Error ? error.message : "バナーのアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const removeBanner = (index: number) => {
    setBanners((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveBanner = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    setBanners((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault();
    const sourceIndex = dragIndex.current;
    dragIndex.current = null;
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setBanners((current) => {
      const reordered = [...current];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    const normalizedBanners = banners.map((url) => url.trim()).filter(Boolean);
    const nextSettings: StoreSettings = {
      ...storeSettings,
      hero_banners: normalizedBanners,
      hero_video: {
        enabled: heroVideo.enabled,
        url: heroVideo.url.trim(),
        poster_url: heroVideo.poster_url.trim(),
      },
    };

    const { error } = await supabase
      .from("stores")
      .update({ settings: nextSettings })
      .eq("id", storeId);

    if (error) {
      console.error("Error saving homepage banner settings:", error);
      toast.error(error.message || "保存に失敗しました");
      setSaving(false);
      return;
    }

    setStoreSettings(nextSettings);
    toast.success("トップページのバナー設定を保存しました");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">トップバナー管理</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {storeName}のトップページに表示するバナーを管理します。1番上が最初に表示されます。
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} className="mr-2" /> 公開HPを確認
                </a>
              </Button>
              <Button onClick={saveSettings} disabled={loading || saving || uploading}>
                {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                保存
              </Button>
            </div>
          </header>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ImagePlus size={20} /> トップページバナー</CardTitle>
              <CardDescription>
                推奨サイズは<strong>1774 × 887px（2:1）</strong>です。追加・削除・順番変更後は、右上の「保存」で公開HPへ反映されます。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 rounded-lg border border-dashed p-4 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <Label htmlFor="hero-banner-url">画像URLから追加</Label>
                  <Input
                    id="hero-banner-url"
                    value={newBannerUrl}
                    onChange={(event) => setNewBannerUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addBannerUrl(newBannerUrl);
                    }}
                    placeholder="https://.../banner.png"
                    className="mt-2"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => addBannerUrl(newBannerUrl)} disabled={!newBannerUrl.trim()}>
                  URLを追加
                </Button>
              </div>

              <div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadBanner} />
                <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
                  {uploading ? "画像をアップロード中..." : "画像ファイルをアップロードして追加"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">PNG / JPG / WebP / GIF、10MB以下。アップロードしただけでは公開されず、「保存」後に反映されます。</p>
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : banners.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                  バナーが未登録です。上から画像を追加してください。
                </div>
              ) : (
                <div className="space-y-3">
                  {banners.map((banner, index) => (
                    <div
                      key={`${banner}-${index}`}
                      draggable
                      onDragStart={() => { dragIndex.current = index; }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(event, index)}
                      className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center"
                    >
                      <GripVertical className="hidden shrink-0 cursor-grab text-muted-foreground sm:block" aria-label="ドラッグして並び替え" />
                      <div className="w-full overflow-hidden rounded-lg border bg-muted sm:w-48" style={{ aspectRatio: "2 / 1" }}>
                        <img src={banner} alt={`トップバナー ${index + 1}`} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">表示順 {index + 1}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{banner}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                        <Button type="button" variant="outline" size="icon" disabled={index === 0} onClick={() => moveBanner(index, -1)} aria-label="上へ移動">
                          <ArrowUp size={16} />
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={index === banners.length - 1} onClick={() => moveBanner(index, 1)} aria-label="下へ移動">
                          <ArrowDown size={16} />
                        </Button>
                        <Button type="button" variant="destructive" size="icon" onClick={() => removeBanner(index)} aria-label="バナーを削除">
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Video size={20} /> トップ動画の表示設定</CardTitle>
              <CardDescription>動画を優先表示している間は、上で設定したバナーがトップの最上部に表示されません。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label htmlFor="hero-video-enabled" className="text-sm font-medium">トップ動画を優先表示する</Label>
                  <p className="mt-1 text-xs text-muted-foreground">オフにすると、保存したトップバナーが先頭から表示されます。</p>
                </div>
                <Switch id="hero-video-enabled" checked={heroVideo.enabled} onCheckedChange={(enabled) => setHeroVideo((current) => ({ ...current, enabled }))} />
              </div>
              {heroVideo.enabled && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="hero-video-url">動画URL</Label>
                    <Input id="hero-video-url" value={heroVideo.url} onChange={(event) => setHeroVideo((current) => ({ ...current, url: event.target.value }))} className="mt-2" placeholder="https://.../movie.mp4" />
                  </div>
                  <div>
                    <Label htmlFor="hero-video-poster">ポスター画像URL（任意）</Label>
                    <Input id="hero-video-poster" value={heroVideo.poster_url} onChange={(event) => setHeroVideo((current) => ({ ...current, poster_url: event.target.value }))} className="mt-2" placeholder="https://.../poster.png" />
                  </div>
                </div>
              )}
              <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info size={16} className="mt-0.5 shrink-0" />
                <p>動画を残したい場合はオンのままにしてください。入店バナーをトップのメイン表示へ切り替える場合は、動画をオフにして保存します。</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
