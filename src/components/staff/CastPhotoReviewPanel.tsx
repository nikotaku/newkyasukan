import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareWarning, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { driveImgUrl } from "@/lib/drive";
import { PHOTO_REVIEW_STATUS_LABELS, type PhotoReview, type PhotoReviewItem } from "@/lib/photoReview";

/** 写真タブの「セラピストに確認を取る」：選んだ写真をマイページへ確認依頼として送り、返事を出す */
export function CastPhotoReviewPanel({
  castId,
  photos,
}: {
  castId: string;
  /** 写真タブの並び（HP表示を先に） */
  photos: { url: string; shown: boolean }[];
}) {
  const { toast } = useToast();
  const [review, setReview] = useState<PhotoReview | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("cast_photo_reviews" as never)
      .select("id, photos, message, status, response_note, requested_at, responded_at")
      .eq("cast_id", castId)
      .neq("status", "cancelled")
      .order("requested_at", { ascending: false })
      .limit(1);
    setReview(((data as PhotoReview[] | null) ?? [])[0] ?? null);
  }, [castId]);

  useEffect(() => { void load(); }, [load]);

  const sendable = photos.filter((photo) => /^https:\/\//.test(photo.url));

  const openDialog = () => {
    const shown = sendable.filter((photo) => photo.shown).map((photo) => photo.url);
    setSelected(shown.length > 0 ? shown : sendable.map((photo) => photo.url));
    setMessage("");
    setOpen(true);
  };

  const toggle = (url: string, checked: boolean) =>
    setSelected((prev) => (checked ? sendable.map((p) => p.url).filter((u) => u === url || prev.includes(u)) : prev.filter((u) => u !== url)));

  const send = async () => {
    if (selected.length === 0) return;
    setSending(true);
    const { error } = await supabase.rpc("request_cast_photo_review" as never, {
      p_cast_id: castId,
      p_photos: selected,
      p_message: message.trim() || null,
    } as never);
    setSending(false);
    if (error) {
      toast({ title: "送れませんでした", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "確認依頼を送りました", description: `${selected.length}枚。マイページに確認依頼が届きます` });
    setOpen(false);
    void load();
  };

  const changeItems = (review?.photos ?? []).filter((item: PhotoReviewItem) => item.answer === "change");

  return (
    <div className="space-y-2">
      {review && (
        <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">セラピストの確認</span>
            <Badge
              variant={review.status === "approved" ? "default" : review.status === "changes_requested" ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {PHOTO_REVIEW_STATUS_LABELS[review.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {new Date(review.requested_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} に{review.photos.length}枚を依頼
            {review.responded_at && `・${new Date(review.responded_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} に返事`}
          </p>
          {review.status === "approved" && (
            <p className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} />全部OKでした</p>
          )}
          {changeItems.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {changeItems.map((item) => (
                <div key={item.url} className="overflow-hidden rounded border border-rose-300 bg-background">
                  <img src={driveImgUrl(item.url)} alt="直してほしい写真" className="aspect-square w-full object-cover" loading="lazy" />
                  <p className="px-1 py-0.5 text-[10px] text-rose-700">{item.note || "直してほしい"}</p>
                </div>
              ))}
            </div>
          )}
          {review.response_note && (
            <p className="flex items-start gap-1"><MessageSquareWarning size={13} className="mt-0.5 shrink-0" />{review.response_note}</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={openDialog} disabled={sendable.length === 0}>
          <Send className="h-4 w-4 mr-1.5" />セラピストに確認を取る
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>セラピストに確認を取る</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            選んだ写真をマイページに確認依頼として送ります。セラピストは1枚ずつ「OK」か「直してほしい」で返事します。前のまだ返事の無い依頼は取り消されます。
          </p>
          <div className="flex items-center justify-between text-xs">
            <span>{selected.length}/{sendable.length}枚を選択</span>
            <div className="flex gap-2">
              <button type="button" className="text-primary" onClick={() => setSelected(sendable.map((p) => p.url))}>すべて</button>
              <button type="button" className="text-primary" onClick={() => setSelected(sendable.filter((p) => p.shown).map((p) => p.url))}>HP表示だけ</button>
              <button type="button" className="text-muted-foreground" onClick={() => setSelected([])}>外す</button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {sendable.map((photo) => {
              const checked = selected.includes(photo.url);
              return (
                <label key={photo.url} className={`relative block cursor-pointer overflow-hidden rounded-md border-2 ${checked ? "border-primary" : "border-transparent opacity-60"}`}>
                  <img src={driveImgUrl(photo.url)} alt="写真" className="aspect-square w-full object-cover" loading="lazy" />
                  <Checkbox checked={checked} onCheckedChange={(v) => toggle(photo.url, v === true)} className="absolute top-1 left-1 bg-background" />
                  {photo.shown && <Badge className="absolute bottom-1 left-1 text-[9px] px-1">HP</Badge>}
                </label>
              );
            })}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="ひとこと（任意）例：加工しました！気になるところがあれば教えてください"
            rows={2}
            maxLength={300}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>やめる</Button>
            <Button type="button" onClick={send} disabled={sending || selected.length === 0}>
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {selected.length}枚を送る
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
