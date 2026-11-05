import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BANNER_TEXT_DEFAULTS, BANNER_TEXT_LABELS, normalizeBannerText, type BannerText } from "@/lib/castHeroBanners";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { CastHeroBannerSlide } from "@/components/public/CastHeroBannerSlide";

// セラピスト編集の「トップバナーの素材」。写真（何枚でも）とキャッチコピーを登録すると、
// 出勤日にトップページのトップバナーへ自動で作って出す（src/lib/castHeroBanners.ts）。
// この欄だけで保存する（プロフィールの保存とは別。エスたまへの同期も動かない）。

interface Props {
  castId: string;
  castName: string;
  age?: number | null;
  initial: { banner_images?: string[] | null; banner_copy?: string | null; banner_enabled?: boolean | null; banner_text?: unknown };
  storeName?: string;
}

const COPY_MAX = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);

export function CastBannerAssetsEditor({ castId, castName, age, initial, storeName }: Props) {
  const [images, setImages] = useState<string[]>(initial.banner_images ?? []);
  const [copy, setCopy] = useState(initial.banner_copy ?? "");
  const [texts, setTexts] = useState<BannerText>(() => normalizeBannerText(initial.banner_text));
  const [enabled, setEnabled] = useState(initial.banner_enabled !== false);
  const [preview, setPreview] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImages(initial.banner_images ?? []);
    setCopy(initial.banner_copy ?? "");
    setTexts(normalizeBannerText(initial.banner_text));
    setEnabled(initial.banner_enabled !== false);
    setDirty(false);
    setPreview(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `banner-assets/${castId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("cast-photos").upload(path, file, { contentType: file.type });
        if (error) throw error;
        uploaded.push(supabase.storage.from("cast-photos").getPublicUrl(path).data.publicUrl);
      }
      if (uploaded.length) {
        setImages((current) => [...current, ...uploaded]);
        setDirty(true);
      }
    } catch (error) {
      console.error("banner asset upload failed", error);
      toast.error("写真をアップロードできませんでした");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await untyped("casts")
        .update({ banner_images: images, banner_copy: copy.trim() || null, banner_enabled: enabled, banner_text: texts })
        .eq("id", castId).select("banner_text, banner_copy").single();
      if (error || !data) throw error ?? new Error("保存対象が見つかりません");
      setDirty(false);
      toast.success("バナーの写真・文言を保存しました");
    } catch {
      toast.error("保存できませんでした。入力内容は残っています");
    } finally {
      setSaving(false);
    }
  };

  const previewImage = images.length ? images[Math.min(preview, images.length - 1)] : null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="font-semibold">トップバナーの素材</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            写真とキャッチコピーを入れておくと、出勤する日にHPのトップバナーへ自動で作って出します（毎日、順番と写真が入れ替わります）。新人の期間は先頭に出ます。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span>{enabled ? "出す" : "出さない"}</span>
          <Switch checked={enabled} onCheckedChange={(value) => { setEnabled(value); setDirty(true); }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {images.map((url, index) => (
          <div key={url} className={`relative h-20 w-16 overflow-hidden rounded-md border ${index === preview ? "ring-2 ring-primary" : ""}`}>
            <button type="button" className="h-full w-full" onClick={() => setPreview(index)} aria-label={`写真${index + 1}をプレビュー`}>
              <img src={url} alt="" className="h-full w-full object-cover object-top" />
            </button>
            <button
              type="button"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              onClick={() => { setImages((current) => current.filter((item) => item !== url)); setPreview(0); setDirty(true); }}
              aria-label={`写真${index + 1}を外す`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[10px] text-muted-foreground hover:bg-muted/50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          写真を追加
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
      </div>
      <p className="text-[11px] text-muted-foreground">縦長の写真（顔が上の方にあるもの）がきれいに収まります。</p>

      <div>
        <Label htmlFor={`banner-copy-${castId}`} className="text-xs">キャッチコピー（{COPY_MAX}文字まで）</Label>
        <Textarea
          rows={2}
          id={`banner-copy-${castId}`}
          value={copy}
          maxLength={COPY_MAX}
          placeholder="例：癒しの笑顔と丁寧なオイルで、心までほぐします"
          onChange={(event) => { setCopy(event.target.value); setDirty(true); }}
        />
      </div>

      <details className="rounded-md border bg-muted/20 p-3" open>
        <summary className="cursor-pointer text-sm font-medium">バナー内の文言を編集</summary>
        <p className="mt-2 text-xs text-muted-foreground">このセラピストのバナー画像内に表示する文字です。空欄にするとその文字を非表示にできます。</p>
        <p className="mt-1 text-xs text-muted-foreground">&#123;name&#125;＝名前、&#123;age&#125;＝年齢、&#123;start&#125;・&#123;end&#125;＝当日の出勤時間、&#123;next&#125;＝最短案内時刻、&#123;store&#125;＝店舗名。自動で差し替わります。</p>
        <fieldset disabled={saving} className="mt-3 space-y-3">
          {(Object.keys(BANNER_TEXT_DEFAULTS) as (keyof BannerText)[]).map((key) => (
            <div key={key}>
              <Label htmlFor={`banner-text-${castId}-${key}`} className="text-xs">{BANNER_TEXT_LABELS[key]}</Label>
              <Input id={`banner-text-${castId}-${key}`} maxLength={160}
                value={texts[key] ?? BANNER_TEXT_DEFAULTS[key]}
                onChange={(event) => { setTexts((current) => ({ ...current, [key]: event.target.value })); setDirty(true); }} />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => { setTexts({}); setDirty(true); }}>バナーの文言を初期状態に戻す</Button>
        </fieldset>
      </details>

      {previewImage && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">プレビュー（出勤時間・最短の空きは当日の内容が入ります）</p>
          <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: "2 / 1" }}>
            <CastHeroBannerSlide
              banner={{ castId, name: castName, age: age ?? null, image: previewImage, copy: copy.trim(), start: "13:00", end: "22:00", isNewcomer: false, text: texts }}
              nextAvailable="15:00"
              storeName={storeName}
              eager
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving || uploading || !dirty}>
          {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
          バナーの素材を保存
        </Button>
      </div>
    </div>
  );
}
