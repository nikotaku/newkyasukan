import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type PortalPhoto = { url: string; shown: boolean };

const MAX_EDGE = 2000;

/** 端末の写真を長い辺2000pxまでのJPEGにして送る（iPhoneの大きな写真・HEICもブラウザが読める形に） */
const toJpegDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!ctx) return reject(new Error("画像を読み込めませんでした"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = objectUrl;
  });

/** マイページ「画像アップロード」：本人が写真を上げてお店に渡す（HPに出すかはお店が選ぶ） */
export function TherapistPhotoUpload({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PortalPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("therapist-photos", { body: { token, ...payload } });
      if (error) {
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      setPhotos((data?.photos as PortalPhoto[]) ?? []);
    },
    [token],
  );

  useEffect(() => {
    call({ action: "list" })
      .catch((error) => toast.error(error instanceof Error ? error.message : "写真を読み込めませんでした"))
      .finally(() => setLoading(false));
  }, [call]);

  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    let ok = 0;
    setUploading({ done: 0, total: list.length });
    for (const file of list) {
      try {
        const image = await toJpegDataUrl(file);
        await call({ action: "upload", image });
        ok++;
      } catch (error) {
        toast.error(`${file.name}：${error instanceof Error ? error.message : "送れませんでした"}`);
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    if (ok > 0) toast.success(`${ok}枚をお店に送りました`);
  };

  const remove = async (url: string) => {
    if (!window.confirm("この写真を消しますか？")) return;
    try {
      await call({ action: "remove", url });
      toast.success("消しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "消せませんでした");
    }
  };

  return (
    <div className="space-y-3 pb-10">
      <Card>
        <CardContent className="space-y-3 pt-4 text-sm">
          <div>
            <p className="font-semibold">写真をお店に送る</p>
            <p className="mt-1 text-xs text-muted-foreground">
              プロフィール・宣伝に使う写真を送ってください（何枚でもOK）。HPに載せる写真はお店が選びます。
            </p>
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
          <Button className="w-full" disabled={!!uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                送信中 {uploading.done}/{uploading.total}
              </>
            ) : (
              <>
                <Camera className="mr-1.5 h-4 w-4" />
                写真を選んで送る
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-2 text-sm font-semibold">送った写真（{photos.length}枚）</p>
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : photos.length === 0 ? (
            <p className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">まだ送った写真はありません</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div key={photo.url} className="relative aspect-square overflow-hidden rounded-md border bg-muted/30">
                  <img src={photo.url} alt="送った写真" loading="lazy" className="h-full w-full object-cover" onClick={() => window.open(photo.url, "_blank")} />
                  {photo.shown ? (
                    <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">HP掲載中</span>
                  ) : (
                    <button
                      type="button"
                      aria-label="消す"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                      onClick={() => void remove(photo.url)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
