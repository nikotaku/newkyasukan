import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { ENKA_ROOMS } from "@/lib/storeRooms";
import { isVideoFile } from "@/lib/roomEntry";

// 入室後のマニュアル（セラピストのマイページ「入室後のマニュアル」に出す）を編集する画面。
// 項目ごとに タイトル・説明・動画（または写真）・ルーム（空なら全ルーム共通）・マイページに出すか。並び順は上下のボタン。
// 動画・写真は entry-photos バケットの manual/<store_id>/（公開URL）。表は therapist_manual_items。

type Item = {
  id: string;
  title: string;
  body: string | null;
  video_url: string | null;
  image_url: string | null;
  room_name: string | null;
  display_order: number;
  is_published: boolean;
};

const db = supabase as unknown as { from: (table: string) => any };
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export default function TherapistManualAdmin() {
  const { storeId } = useAdminStore();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await db.from("therapist_manual_items")
      .select("id,title,body,video_url,image_url,room_name,display_order,is_published")
      .eq("store_id", storeId).order("display_order").order("created_at");
    if (error) toast.error("読み込めませんでした");
    setItems((data ?? []) as Item[]);
    setDirty({});
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, next: Partial<Item>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
    setDirty((prev) => ({ ...prev, [id]: true }));
  };

  const save = async (item: Item) => {
    if (!item.title.trim()) { toast.error("タイトルを入れてください"); return; }
    setBusyId(item.id);
    const { error } = await db.from("therapist_manual_items").update({
      title: item.title.trim(),
      body: item.body?.trim() || null,
      video_url: item.video_url,
      image_url: item.image_url,
      room_name: item.room_name,
      is_published: item.is_published,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    setBusyId(null);
    if (error) { toast.error("保存できませんでした"); return; }
    setDirty((prev) => ({ ...prev, [item.id]: false }));
    toast.success("保存しました");
  };

  const add = async () => {
    if (!storeId) return;
    const { error } = await db.from("therapist_manual_items").insert({
      store_id: storeId, title: "新しい項目", display_order: (items.at(-1)?.display_order ?? 0) + 10,
    });
    if (error) { toast.error("追加できませんでした"); return; }
    void load();
  };

  const remove = async (item: Item) => {
    if (!confirm(`「${item.title}」を消しますか？`)) return;
    const { error } = await db.from("therapist_manual_items").delete().eq("id", item.id);
    if (error) { toast.error("消せませんでした"); return; }
    setItems((prev) => prev.filter((x) => x.id !== item.id));
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    const renumbered = next.map((item, i) => ({ ...item, display_order: (i + 1) * 10 }));
    setItems(renumbered);
    const results = await Promise.all([renumbered[index], renumbered[target]].map((item) =>
      db.from("therapist_manual_items").update({ display_order: item.display_order }).eq("id", item.id)));
    if (results.some((r: { error: unknown }) => r.error)) toast.error("並び順を保存できませんでした");
  };

  const upload = async (item: Item, file: File | undefined) => {
    if (!file || !storeId) return;
    if (file.size > MAX_UPLOAD_BYTES) { toast.error("50MBまでのファイルにしてください（動画は短く切ってください）"); return; }
    setBusyId(item.id);
    try {
      const video = isVideoFile(file);
      const ext = file.name.split(".").pop() || (video ? "mp4" : "jpg");
      const path = `manual/${storeId}/${item.id}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("entry-photos").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      const url = supabase.storage.from("entry-photos").getPublicUrl(path).data.publicUrl;
      const next = video ? { video_url: url, image_url: null } : { image_url: url, video_url: null };
      const { error: updateError } = await db.from("therapist_manual_items").update(next).eq("id", item.id);
      if (updateError) throw updateError;
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...next } : x)));
      toast.success(video ? "動画を入れました" : "写真を入れました");
    } catch (error) {
      console.error(error);
      toast.error("アップロードできませんでした");
    } finally {
      setBusyId(null);
    }
  };

  const clearMedia = async (item: Item) => {
    const { error } = await db.from("therapist_manual_items").update({ video_url: null, image_url: null }).eq("id", item.id);
    if (error) { toast.error("外せませんでした"); return; }
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, video_url: null, image_url: null } : x)));
  };

  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpen size={22} />入室後のマニュアル</h1>
            <p className="mt-1 text-xs text-muted-foreground">セラピストのマイページ「入室後のマニュアル」に出します。動画は50MBまで（スマホで撮ったものをそのまま入れられます）。</p>
          </div>
          <Button size="sm" onClick={() => void add()}><Plus size={14} className="mr-1" />項目を追加</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">まだ項目がありません</CardContent></Card>
        ) : items.map((item, index) => (
          <Card key={item.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                <Input value={item.title} maxLength={80} onChange={(e) => patch(item.id, { title: e.target.value })} className="font-semibold" />
                <div className="flex shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => void move(index, -1)} disabled={index === 0} aria-label="上へ"><ArrowUp size={14} /></Button>
                  <Button size="icon" variant="ghost" onClick={() => void move(index, 1)} disabled={index === items.length - 1} aria-label="下へ"><ArrowDown size={14} /></Button>
                  <Button size="icon" variant="ghost" onClick={() => void remove(item)} aria-label="消す"><Trash2 size={14} /></Button>
                </div>
              </div>

              {item.video_url ? (
                <video src={item.video_url} controls playsInline preload="metadata" className="aspect-video w-full rounded-md bg-black" />
              ) : item.image_url ? (
                <img src={item.image_url} alt="" className="max-h-72 w-full rounded-md object-contain" />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline" disabled={busyId === item.id}>
                  <label className="cursor-pointer">
                    {busyId === item.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
                    {item.video_url || item.image_url ? "動画・写真を入れ替える" : "動画・写真を入れる"}
                    <input type="file" accept="video/*,image/*" className="hidden" onChange={(e) => void upload(item, e.target.files?.[0])} />
                  </label>
                </Button>
                {(item.video_url || item.image_url) && (
                  <Button size="sm" variant="ghost" onClick={() => void clearMedia(item)}><X size={14} className="mr-1" />外す</Button>
                )}
              </div>

              <div>
                <Label className="text-xs">説明</Label>
                <Textarea className="mt-1" rows={3} maxLength={2000} value={item.body ?? ""} onChange={(e) => patch(item.id, { body: e.target.value })} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">ルーム</span>
                  {[null, ...ENKA_ROOMS].map((room) => (
                    <Button key={room ?? "all"} size="sm" variant={item.room_name === room ? "default" : "outline"} onClick={() => patch(item.id, { room_name: room })}>
                      {room ?? "全ルーム共通"}
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  マイページに出す
                  <Switch checked={item.is_published} onCheckedChange={(checked) => patch(item.id, { is_published: checked })} />
                </label>
              </div>

              {dirty[item.id] && (
                <Button size="sm" onClick={() => void save(item)} disabled={busyId === item.id}>
                  <Save size={14} className="mr-1" />保存
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminPageShell>
  );
}
