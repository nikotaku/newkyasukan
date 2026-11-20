import { useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarClock, Clock, ImagePlus, Loader2, Ticket, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

// AI広報部のニュース自動配信（エステ魂の「AI広報部」と同じ4種類）。
// セラピストの記事はそのセラピストのパネル写真（HPの1枚目）を自動で付ける。クーポンは画像を登録したものだけ紹介する。
// 作った記事は HP のニュースに載り、同じ内容・画像でエステ魂のニュースにも出す（DB: private.pr_tick）。

const db: SupabaseClient = supabase;
const BUCKET = "banner-images";

type NewsKey = "news_attendance" | "news_intro" | "news_coupon" | "news";
type Settings = Record<NewsKey, boolean> & { news_images: Record<string, string> | null };

const TYPES: Array<{ key: NewsKey; title: string; text: string; image: string; icon: typeof Clock }> = [
  { key: "news_attendance", title: "本日の出勤", text: "出勤中のセラピストを1人ずつ記事にします（他の種類より優先。1人1日1回）", image: "その日のセラピストのパネル写真", icon: CalendarClock },
  { key: "news_intro", title: "セラピスト紹介", text: "在籍のセラピストを、前に紹介してから長い順に1人ずつ紹介します（店長コメント・紹介文から）", image: "そのセラピストのパネル写真", icon: UserRound },
  { key: "news_coupon", title: "クーポン紹介", text: "下で画像を登録したクーポンを紹介します（1つのクーポンは1日1回）", image: "登録したクーポンの画像", icon: Ticket },
  { key: "news", title: "今すぐご案内", text: "いちばん早く案内できるセラピストの「今すぐ」「最短◯時から」を記事にします", image: "そのセラピストのパネル写真", icon: Clock },
];

export function PrNewsTypes({ storeId }: { storeId: string }) {
  const [saving, setSaving] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  const settings = useQuery({
    queryKey: ["pr-news-settings", storeId],
    queryFn: async () => {
      const r = await db.from("pr_desk_settings").select("news,news_attendance,news_intro,news_coupon,news_images").eq("store_id", storeId).maybeSingle();
      if (r.error) throw r.error;
      return r.data as Settings | null;
    },
  });
  const coupons = useQuery({
    queryKey: ["pr-news-coupons", storeId],
    queryFn: async () => {
      const r = await db.from("discounts").select("id,name,discount_value").eq("store_id", storeId).eq("is_active", true).order("display_order", { ascending: true, nullsFirst: false });
      if (r.error) throw r.error;
      return (r.data ?? []) as Array<{ id: string; name: string; discount_value: number | null }>;
    },
  });
  const photoStatus = useQuery({
    queryKey: ["pr-news-photo-status", storeId],
    queryFn: async () => {
      const r = await db.rpc("pr_news_photo_status", { p_store: storeId });
      if (r.error) throw r.error;
      return r.data as { without_photo: string[]; without_intro: string[] };
    },
  });

  const toggle = async (key: NewsKey, value: boolean) => {
    setSaving(key);
    const r = await db.from("pr_desk_settings").update({ [key]: value }).eq("store_id", storeId).select("store_id").single();
    setSaving(null);
    if (r.error) { toast.error("切り替えられませんでした"); return; }
    await settings.refetch();
    toast.success(`${TYPES.find(t => t.key === key)?.title}の自動投稿を${value ? "オン" : "オフ"}にしました`);
  };

  // 画像の割り当ては保存の直前に読み直して、そのキーだけ入れ替える（ほかの画面・端末の変更を消さない）
  const saveImage = async (imageKey: string, url: string | null) => {
    const latest = await db.from("pr_desk_settings").select("news_images").eq("store_id", storeId).single();
    if (latest.error) throw latest.error;
    const images = { ...((latest.data?.news_images as Record<string, string> | null) ?? {}) };
    if (url) images[imageKey] = url; else delete images[imageKey];
    const r = await db.from("pr_desk_settings").update({ news_images: images }).eq("store_id", storeId).select("store_id").single();
    if (r.error) throw r.error;
    await settings.refetch();
  };

  const pickImage = (imageKey: string) => {
    uploadFor.current = imageKey;
    fileRef.current?.click();
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const imageKey = uploadFor.current;
    if (!file || !imageKey) return;
    // エステ魂のニュースは JPEG・PNG だけ受け付ける
    if (!/^image\/(jpeg|png)$/.test(file.type)) { toast.error("JPEG か PNG の画像を選んでください"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("10MBまでの画像にしてください"); return; }
    setSaving(imageKey);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `pr-news/${storeId}/${imageKey.replace(/[^a-z0-9-]/gi, "_")}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (error) throw error;
      await saveImage(imageKey, supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      toast.success("画像を登録しました");
    } catch (error) {
      console.error("pr news image upload failed", error);
      toast.error("画像を登録できませんでした");
    } finally {
      setSaving(null);
    }
  };

  const removeImage = async (imageKey: string) => {
    setSaving(imageKey);
    try { await saveImage(imageKey, null); toast.success("画像を外しました"); }
    catch { toast.error("画像を外せませんでした"); }
    finally { setSaving(null); }
  };

  if (settings.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />読み込み中…</div>;
  if (!settings.data) return <p className="text-sm text-muted-foreground">AI広報部の設定がまだありません。</p>;
  const images = settings.data.news_images ?? {};
  const couponsWithImage = (coupons.data ?? []).filter(c => images[`coupon:${c.id}`]).length;
  const missingPhoto = photoStatus.data?.without_photo ?? [];
  const missingIntro = photoStatus.data?.without_intro ?? [];

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={upload} />
      <div>
        <h3 className="font-bold">ニュースの自動投稿（画像付き）</h3>
        <p className="text-xs text-muted-foreground">HPのニュースに載せ、同じ内容と画像でエステ魂のニュースにも出します。営業時間を10に分けた時間帯ごとに1本まで（エステ魂のニュースは1日10回まで）。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TYPES.map(type => {
          const Icon = type.icon;
          const on = !!settings.data?.[type.key];
          return (
            <div key={type.key} className="rounded-lg border bg-card">
              <div className="flex gap-3 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted"><Icon className="h-7 w-7 text-muted-foreground" /></div>
                <div className="min-w-0">
                  <p className="font-bold">{type.title}</p>
                  <p className="text-xs text-muted-foreground">{type.text}</p>
                  <p className="mt-1 text-xs">画像：{type.image}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t px-3 py-2">
                {saving === type.key && <Loader2 className="h-4 w-4 animate-spin" />}
                <span className={on ? "font-bold text-rose-600" : "text-muted-foreground"}>自動投稿 {on ? "ON" : "OFF"}</span>
                <Switch checked={on} disabled={saving !== null} onCheckedChange={value => toggle(type.key, value)} aria-label={`${type.title}の自動投稿`} />
              </div>
              {type.key === "news_coupon" && on && couponsWithImage === 0 && (
                <p className="border-t px-3 py-2 text-xs text-amber-700">画像を登録したクーポンがまだ無いので、クーポン紹介は投稿されません。</p>
              )}
            </div>
          );
        })}
      </div>

      {(missingPhoto.length > 0 || missingIntro.length > 0) && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          {missingPhoto.length > 0 && <p>パネル写真が無いので記事にしない人：{missingPhoto.join("・")}（スタッフ画面の写真タブで「HP表示」の写真を入れてください）</p>}
          {missingIntro.length > 0 && <p>紹介文が無いのでセラピスト紹介に出ない人：{missingIntro.join("・")}</p>}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-bold">クーポンの画像</h4>
        <p className="text-xs text-muted-foreground">画像を登録したクーポンだけを紹介します（JPEG・PNG）。</p>
        {(coupons.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">使っている割引・クーポンがありません。</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {(coupons.data ?? []).map(coupon => {
            const key = `coupon:${coupon.id}`;
            const url = images[key];
            return (
              <div key={coupon.id} className="flex items-center gap-3 rounded-md border p-2">
                {url
                  ? <img src={url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">画像なし</div>}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{coupon.name}</p>
                  <div className="mt-1 flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={saving !== null} onClick={() => pickImage(key)}>
                      {saving === key ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ImagePlus className="mr-1 h-3 w-3" />}
                      {url ? "変える" : "画像を登録"}
                    </Button>
                    {url && (
                      <Button type="button" size="sm" variant="ghost" disabled={saving !== null} onClick={() => removeImage(key)} aria-label="画像を外す">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
