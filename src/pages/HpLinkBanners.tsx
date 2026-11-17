import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImagePlus, Link2, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { copyText } from "@/lib/copyText";
import {
  LINK_BANNER_NAME_MAX,
  createLinkBanner,
  normalizeLinkBanners,
  ownLinkBannerHtml,
  safeHttpUrl,
  type LinkBanner,
} from "@/lib/linkBanners";

const BUCKET = "banner-images";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_STORE_SITE = "https://enka-salon.jp";

type StoreSettings = Record<string, Json | undefined>;

/**
 * ホームページダッシュボードの「リンク」タブ：HPの「リンク一覧」（/links）に出す他社のリンクバナーと、
 * 相互リンク用の当店のバナーを管理する（stores.settings.link_banners / link_own_banner）。
 */
export default function HpLinkBanners({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useAdminStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [banners, setBanners] = useState<LinkBanner[]>([]);
  const [ownBanner, setOwnBanner] = useState("");
  const [storeName, setStoreName] = useState("艶華");
  const [siteUrl, setSiteUrl] = useState(DEFAULT_STORE_SITE);
  const [draft, setDraft] = useState({ name: "", url: "", image_url: "" });
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) window.location.assign("/login");
  }, [authLoading, user]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stores")
      .select("name, custom_domain, is_default, settings")
      .eq("id", storeId)
      .maybeSingle();
    if (error || !data) {
      console.error("Error loading link banners:", error);
      toast.error("リンク一覧の読み込みに失敗しました");
      setLoading(false);
      return;
    }
    const settings = (data.settings ?? {}) as StoreSettings;
    setBanners(normalizeLinkBanners(settings.link_banners));
    setOwnBanner(safeHttpUrl(settings.link_own_banner));
    setStoreName(data.name || "艶華");
    const domain = (data.custom_domain ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    setSiteUrl(domain ? `https://${domain}` : data.is_default ? DEFAULT_STORE_SITE : window.location.origin);
    setDirty(false);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (!user || storeLoading) return;
    void load();
  }, [user, storeLoading, load]);

  const linksPageUrl = `${siteUrl}/links`;
  const ownHtml = useMemo(
    () => ownLinkBannerHtml({ siteUrl: `${siteUrl}/`, imageUrl: ownBanner, name: storeName }),
    [siteUrl, ownBanner, storeName],
  );

  const change = (update: (current: LinkBanner[]) => LinkBanner[]) => {
    setBanners(update);
    setDirty(true);
  };

  const updateBanner = (id: string, patch: Partial<LinkBanner>) =>
    change((current) => current.map((banner) => (banner.id === id ? { ...banner, ...patch } : banner)));

  const move = (index: number, direction: -1 | 1) =>
    change((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) => {
    const banner = banners.find((b) => b.id === id);
    if (!window.confirm(`「${banner?.name ?? "このバナー"}」を消しますか？（保存するとHPから消えます）`)) return;
    change((current) => current.filter((b) => b.id !== id));
  };

  const addDraft = () => {
    const created = createLinkBanner(draft);
    if (typeof created === "string") {
      toast.error(created);
      return;
    }
    if (banners.some((b) => b.url === created.url)) {
      toast.message("同じリンク先のバナーがすでにあります");
      return;
    }
    change((current) => [...current, created]);
    setDraft({ name: "", url: "", image_url: "" });
    toast.success("追加しました。右上の「保存」でHPに出ます");
  };

  /** "draft" = 追加の入力欄、"own" = 当店のバナー、それ以外 = そのバナーの画像を差し替え */
  const pickImage = (key: string) => {
    uploadTarget.current = key;
    fileRef.current?.click();
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const key = uploadTarget.current;
    event.target.value = "";
    if (!file || !key) return;
    if (!file.type.startsWith("image/")) {
      toast.error("PNG・JPG・GIF・WebP の画像を選んでください");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("画像は5MB以下にしてください");
      return;
    }
    setUploadingKey(key);
    try {
      const extension = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `link-banners/${storeId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      if (key === "draft") setDraft((d) => ({ ...d, image_url: url }));
      else if (key === "own") {
        setOwnBanner(url);
        setDirty(true);
      } else updateBanner(key, { image_url: url });
      toast.success("画像を入れました。右上の「保存」でHPに出ます");
    } catch (error) {
      console.error("Error uploading link banner:", error);
      toast.error(error instanceof Error ? error.message : "画像をアップロードできませんでした");
    } finally {
      setUploadingKey(null);
    }
  };

  const save = async () => {
    for (const banner of banners) {
      if (!safeHttpUrl(banner.url)) {
        toast.error(`「${banner.name || "名前なし"}」のリンク先URLを https:// から入れてください`);
        return;
      }
      if (banner.image_url.trim() && !safeHttpUrl(banner.image_url)) {
        toast.error(`「${banner.name || "名前なし"}」の画像URLを https:// から入れてください`);
        return;
      }
    }
    setSaving(true);
    try {
      // ほかのタブ（トップバナーなど）で変えた設定を消さないよう、保存の直前に読み直してこの2つだけ入れ替える
      const { data: latest, error: readError } = await supabase.from("stores").select("settings").eq("id", storeId).maybeSingle();
      if (readError || !latest) throw readError ?? new Error("保存対象の店舗を確認できませんでした");
      const cleaned = normalizeLinkBanners(banners);
      const nextSettings: StoreSettings = {
        ...((latest.settings ?? {}) as StoreSettings),
        link_banners: cleaned as unknown as Json,
        link_own_banner: safeHttpUrl(ownBanner),
      };
      const { data: saved, error } = await supabase
        .from("stores")
        .update({ settings: nextSettings })
        .eq("id", storeId)
        .select("id")
        .maybeSingle();
      if (error || !saved) throw error ?? new Error("保存対象の店舗を確認できませんでした");
      setBanners(cleaned);
      setDirty(false);
      toast.success("リンク一覧を保存しました");
    } catch (error) {
      console.error("Error saving link banners:", error);
      toast.error(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string) => {
    if (await copyText(value)) toast.success("コピーしました");
    else toast.error("コピーできませんでした。長押しで選んでコピーしてください");
  };

  const busy = loading || saving || uploadingKey !== null;

  return (
    <AdminPageShell embedded={embedded} mainClassName="p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={uploadImage} />

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">リンク一覧（他社バナー）</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              HPの「リンク」ページ（フッターから開けます）に、ポータルサイト・ランキングサイトなど他社のリンクバナーを並べます。上から順に表示されます。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="outline">
              <a href={linksPageUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} className="mr-2" /> 公開ページ
              </a>
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
              保存{dirty ? "（未保存あり）" : ""}
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Plus size={20} /> バナーを追加</CardTitle>
            <CardDescription>
              相手のサイトから指定されたバナー画像（画像のURL、または保存した画像ファイル）とリンク先を入れます。画像が無いときはサイト名の文字リンクになります。
              他社のHTMLコードはそのまま貼れません（HPで他社のスクリプトが動かないように、画像とリンク先だけを使います）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="link-draft-name">サイト名</Label>
                <Input
                  id="link-draft-name"
                  className="mt-1.5"
                  maxLength={LINK_BANNER_NAME_MAX}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="例：メンズエステ情報サイト"
                />
              </div>
              <div>
                <Label htmlFor="link-draft-url">リンク先URL（必須）</Label>
                <Input
                  id="link-draft-url"
                  className="mt-1.5"
                  inputMode="url"
                  value={draft.url}
                  onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <Label htmlFor="link-draft-image">バナー画像</Label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="link-draft-image"
                  inputMode="url"
                  value={draft.image_url}
                  onChange={(e) => setDraft((d) => ({ ...d, image_url: e.target.value }))}
                  placeholder="画像のURL（https://.../banner.gif）"
                />
                <Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => pickImage("draft")}>
                  {uploadingKey === "draft" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
                  画像ファイルを選ぶ
                </Button>
              </div>
              {safeHttpUrl(draft.image_url) && (
                <img src={draft.image_url} alt="追加するバナー" className="mt-2 max-h-24 max-w-full rounded border bg-muted/30 object-contain" />
              )}
            </div>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy || !draft.url.trim()} onClick={addDraft}>
              <Plus size={16} className="mr-2" /> 一覧に追加
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Link2 size={20} /> 掲載中のバナー（{banners.filter((b) => b.enabled).length}件）</CardTitle>
            <CardDescription>「表示」をオフにするとHPから隠せます（設定は残ります）。変えたら右上の「保存」でHPに反映されます。</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
            ) : banners.length === 0 ? (
              <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">まだバナーはありません。上から追加してください。</p>
            ) : (
              <div className="space-y-3">
                {banners.map((banner, index) => (
                  <div key={banner.id} className={`space-y-3 rounded-xl border bg-card p-3 ${banner.enabled ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {safeHttpUrl(banner.image_url) ? (
                          <img src={banner.image_url} alt={banner.name} className="max-h-20 max-w-full rounded border bg-muted/30 object-contain" />
                        ) : (
                          <p className="text-xs text-muted-foreground">画像なし（文字のリンクで表示）</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <label className="mr-1 flex items-center gap-1.5 text-xs">
                          <Switch checked={banner.enabled} onCheckedChange={(enabled) => updateBanner(banner.id, { enabled })} aria-label="HPに表示" />
                          表示
                        </label>
                        <Button type="button" variant="outline" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上へ">
                          <ArrowUp size={16} />
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={index === banners.length - 1} onClick={() => move(index, 1)} aria-label="下へ">
                          <ArrowDown size={16} />
                        </Button>
                        <Button type="button" variant="destructive" size="icon" onClick={() => remove(banner.id)} aria-label="消す">
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <Label className="text-xs">サイト名</Label>
                        <Input className="mt-1" maxLength={LINK_BANNER_NAME_MAX} value={banner.name} onChange={(e) => updateBanner(banner.id, { name: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">リンク先URL</Label>
                        <Input className="mt-1" inputMode="url" value={banner.url} onChange={(e) => updateBanner(banner.id, { url: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">バナー画像のURL</Label>
                      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                        <Input inputMode="url" value={banner.image_url} placeholder="空なら文字のリンク" onChange={(e) => updateBanner(banner.id, { image_url: e.target.value })} />
                        <Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => pickImage(banner.id)}>
                          {uploadingKey === banner.id ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ImagePlus size={16} className="mr-2" />}
                          画像を変える
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><ImagePlus size={20} /> 当店のリンク用バナー（相互リンク用）</CardTitle>
            <CardDescription>
              相手のサイトに貼ってもらう当店のバナーです。入れるとリンク一覧のページの下に、バナーと貼り付け用のHTMLが出ます（空なら出しません）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                inputMode="url"
                value={ownBanner}
                onChange={(e) => {
                  setOwnBanner(e.target.value);
                  setDirty(true);
                }}
                placeholder="当店のバナー画像のURL"
              />
              <Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => pickImage("own")}>
                {uploadingKey === "own" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
                画像ファイルを選ぶ
              </Button>
            </div>
            {safeHttpUrl(ownBanner) && (
              <img src={ownBanner} alt={storeName} className="max-h-24 max-w-full rounded border bg-muted/30 object-contain" />
            )}
            <div>
              <Label className="text-xs">相手に渡すHTML</Label>
              <Textarea readOnly value={ownHtml} className="mt-1 font-mono text-xs" rows={3} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void copy(ownHtml)}>
                <Copy size={14} className="mr-1.5" /> HTMLをコピー
              </Button>
            </div>
            <div>
              <Label className="text-xs">リンク一覧のページ（相手に「バナーを貼りました」と伝えるとき）</Label>
              <div className="mt-1 flex gap-2">
                <Input readOnly value={linksPageUrl} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => void copy(linksPageUrl)} aria-label="URLをコピー">
                  <Copy size={16} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  );
}
