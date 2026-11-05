import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { CastHeroBannerSlide } from "@/components/public/CastHeroBannerSlide";

// セラピスト編集の「トップバナーの素材」。写真（何枚でも）とキャッチコピーを登録すると、
// 出勤日にトップページのトップバナーへ自動で作って出す（src/lib/castHeroBanners.ts）。
// この欄だけで保存する（プロフィールの保存とは別。エスたまへの同期も動かない）。

interface Props {
  storeId: string;
  castId: string;
  castName: string;
  age?: number | null;
  initial: { banner_images?: string[] | null; banner_copy?: string | null; banner_enabled?: boolean | null };
  storeName?: string;
}

const COPY_MAX = 40;
const DEFAULT_TEXT = {
  title: "トップバナーの素材",
  description: "写真とキャッチコピーを入れておくと、出勤する日にHPのトップバナーへ自動で作って出します（毎日、順番と写真が入れ替わります）。新人の期間は先頭に出ます。",
  enabled: "出す",
  disabled: "出さない",
  addPhoto: "写真を追加",
  photoHint: "縦長の写真（顔が上の方にあるもの）がきれいに収まります。",
  copyLabel: "キャッチコピー（40文字まで）",
  copyPlaceholder: "例：癒しの笑顔と丁寧なオイルで、心までほぐします",
  preview: "プレビュー（出勤時間・最短の空きは当日の内容が入ります）",
  save: "バナーの素材を保存",
};
type EditorText = typeof DEFAULT_TEXT;
const TEXT_LABELS: Record<keyof EditorText, string> = {
  title: "見出し", description: "説明文", enabled: "表示する時の文言", disabled: "表示しない時の文言",
  addPhoto: "写真追加ボタン", photoHint: "写真の注意書き", copyLabel: "キャッチコピーの項目名",
  copyPlaceholder: "キャッチコピーの入力例", preview: "プレビューの説明", save: "保存ボタン",
};
function editorText(value: unknown): EditorText {
  const result = { ...DEFAULT_TEXT };
  if (value && typeof value === "object") {
    for (const key of Object.keys(result) as (keyof EditorText)[]) {
      const text = (value as Record<string, unknown>)[key];
      if (typeof text === "string") result[key] = text;
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);

export function CastBannerAssetsEditor({ storeId, castId, castName, age, initial, storeName }: Props) {
  const [texts, setTexts] = useState<EditorText>({ ...DEFAULT_TEXT });
  const [textDirty, setTextDirty] = useState(false);
  const [textLoading, setTextLoading] = useState(true);
  const [textError, setTextError] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setTextLoading(true);
    setTextDirty(false);
    setTextError(false);
    setTexts({ ...DEFAULT_TEXT });
    void supabase.from("stores").select("settings").eq("id", storeId).single().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setTextError(true);
      else setTexts(editorText((data.settings as Record<string, unknown> | null)?.cast_banner_editor_text));
      setTextLoading(false);
    }).catch(() => {
      if (active) { setTextError(true); setTextLoading(false); }
    });
    return () => { active = false; };
  }, [storeId, reload]);

  const saveTexts = async () => {
    setTextSaving(true);
    try {
      const { data, error } = await supabase.from("stores").select("settings").eq("id", storeId).single();
      if (error) throw error;
      const settings = data.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings : {};
      const { error: saveError } = await supabase.from("stores")
        .update({ settings: { ...settings, cast_banner_editor_text: texts } })
        .eq("id", storeId).select("id").single();
      if (saveError) throw saveError;
      setTextDirty(false);
      toast.success("文言を保存しました。同じ店舗のセラピストに共通で適用されます");
    } catch {
      toast.error("文言を保存できませんでした。入力内容は残っています");
    } finally {
      setTextSaving(false);
    }
  };

  const [images, setImages] = useState<string[]>(initial.banner_images ?? []);
  const [copy, setCopy] = useState(initial.banner_copy ?? "");
  const [enabled, setEnabled] = useState(initial.banner_enabled !== false);
  const [preview, setPreview] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImages(initial.banner_images ?? []);
    setCopy(initial.banner_copy ?? "");
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
    const { error } = await untyped("casts")
      .update({ banner_images: images, banner_copy: copy.trim() || null, banner_enabled: enabled })
      .eq("id", castId);
    setSaving(false);
    if (error) {
      toast.error("保存できませんでした");
      return;
    }
    setDirty(false);
    toast.success("トップバナーの素材を保存しました");
  };

  const previewImage = images.length ? images[Math.min(preview, images.length - 1)] : null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <Label className="font-semibold">{texts.title}</Label>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
            {texts.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span>{enabled ? texts.enabled : texts.disabled}</span>
          <Switch checked={enabled} onCheckedChange={(value) => { setEnabled(value); setDirty(true); }} />
        </div>
      </div>

      <details className="rounded-md border bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-medium">文言を編集</summary>
        <p className="mt-2 text-xs text-muted-foreground">この欄の表示文言を変更します。同じ店舗の全セラピストに共通です。公開バナーのキャッチコピーは下の入力欄で設定します。</p>
        {textError ? (
          <div className="mt-2 text-xs" role="alert">文言を読み込めませんでした。
            <Button type="button" variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>再読み込み</Button>
          </div>
        ) : textLoading ? <p className="mt-2 text-xs" role="status">読み込み中…</p> : (
          <fieldset disabled={textSaving} className="mt-3 space-y-3">
            {(Object.keys(TEXT_LABELS) as (keyof EditorText)[]).map((key) => (
              <div key={key}>
                <Label htmlFor={`banner-text-${castId}-${key}`} className="text-xs">{TEXT_LABELS[key]}</Label>
                <Textarea id={`banner-text-${castId}-${key}`} rows={key === "description" ? 3 : 2}
                  value={texts[key]} maxLength={1000}
                  onChange={(event) => { setTexts((current) => ({ ...current, [key]: event.target.value })); setTextDirty(true); }} />
              </div>
            ))}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { setTexts({ ...DEFAULT_TEXT }); setTextDirty(true); }}>初期文言に戻す</Button>
              <Button type="button" size="sm" disabled={!textDirty || textSaving} onClick={() => void saveTexts()}>
                {textSaving && <Loader2 size={14} className="mr-1 animate-spin" />}文言を保存
              </Button>
            </div>
          </fieldset>
        )}
      </details>

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
          {texts.addPhoto}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
      </div>
      <p className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{texts.photoHint}</p>

      <div>
        <Label htmlFor={`banner-copy-${castId}`} className="text-xs">{texts.copyLabel}</Label>
        <Input
          id={`banner-copy-${castId}`}
          value={copy}
          maxLength={COPY_MAX}
          placeholder={texts.copyPlaceholder}
          onChange={(event) => { setCopy(event.target.value); setDirty(true); }}
        />
      </div>

      {previewImage && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{texts.preview}</p>
          <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: "2 / 1" }}>
            <CastHeroBannerSlide
              banner={{ castId, name: castName, age: age ?? null, image: previewImage, copy: copy.trim(), start: "13:00", end: "22:00", isNewcomer: false }}
              nextAvailable="15:00"
              storeName={storeName}
              eager
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
          {texts.save}
        </Button>
      </div>
    </div>
  );
}
