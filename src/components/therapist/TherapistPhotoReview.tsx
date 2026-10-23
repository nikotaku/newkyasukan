import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ImageIcon, Loader2, PencilLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { driveImgUrl } from "@/lib/drive";
import { PHOTO_REVIEW_STATUS_LABELS, type PhotoReview, type PhotoReviewItem } from "@/lib/photoReview";

/** お店から届いた写真の確認依頼を読む（無ければ null） */
export async function fetchTherapistPhotoReview(token: string): Promise<PhotoReview | null> {
  const { data, error } = await supabase.rpc("get_therapist_photo_review" as never, { p_token: token } as never);
  if (error) throw error;
  return (data as PhotoReview | null) ?? null;
}

/** マイページ：お店が加工した写真を1枚ずつ「OK」か「直してほしい」で返事する */
export function TherapistPhotoReview({ token, onAnswered }: { token: string; onAnswered?: () => void }) {
  const [review, setReview] = useState<PhotoReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<PhotoReviewItem[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchTherapistPhotoReview(token);
      setReview(next);
      setAnswers((next?.photos ?? []).map((item) => ({ url: item.url, answer: item.answer ?? "ok", note: item.note ?? "" })));
      setNote(next?.response_note ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  if (!review) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        <ImageIcon className="mx-auto mb-2 text-muted-foreground/60" />今は確認してほしい写真はありません
      </CardContent></Card>
    );
  }

  const pending = review.status === "pending";
  const update = (url: string, patch: Partial<PhotoReviewItem>) =>
    setAnswers((prev) => prev.map((item) => (item.url === url ? { ...item, ...patch } : item)));

  const submit = async () => {
    const missingNote = answers.some((item) => item.answer === "change" && !item.note?.trim()) && !note.trim();
    if (missingNote && !window.confirm("直してほしいところが書かれていません。このまま送りますか？")) return;
    setSending(true);
    const { error } = await supabase.rpc("respond_therapist_photo_review" as never, {
      p_token: token,
      p_review_id: review.id,
      p_answers: answers,
      p_note: note.trim() || null,
    } as never);
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("お店に返事を送りました");
    await load();
    onAnswered?.();
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">お店が加工した写真の確認</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pending ? "bg-amber-100 text-amber-800" : review.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
            {pending ? "返事待ち" : `返事済み：${PHOTO_REVIEW_STATUS_LABELS[review.status]}`}
          </span>
        </div>
        {review.message && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-sm">{review.message}</p>}
        <p className="text-xs text-muted-foreground">
          {pending
            ? "1枚ずつ「OK」か「直してほしい」を選んで、最後に「お店に返事を送る」を押してください。写真をタップすると大きく見られます。"
            : "返事を送りました。お店が直したら、また確認依頼が届きます。"}
        </p>
      </CardContent></Card>

      <div className="space-y-3">
        {answers.map((item, index) => (
          <Card key={item.url} className={item.answer === "change" ? "border-rose-300" : ""}>
            <CardContent className="p-3 space-y-2">
              <a href={driveImgUrl(item.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-muted">
                <img src={driveImgUrl(item.url)} alt={`写真${index + 1}`} className="mx-auto max-h-[60vh] w-auto object-contain" loading="lazy" />
              </a>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" disabled={!pending} variant={item.answer === "ok" ? "default" : "outline"}
                  className={item.answer === "ok" ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                  onClick={() => update(item.url, { answer: "ok" })}>
                  <Check size={16} className="mr-1" />OK
                </Button>
                <Button type="button" disabled={!pending} variant={item.answer === "change" ? "destructive" : "outline"}
                  onClick={() => update(item.url, { answer: "change" })}>
                  <PencilLine size={16} className="mr-1" />直してほしい
                </Button>
              </div>
              {item.answer === "change" && (
                <Textarea value={item.note ?? ""} disabled={!pending} maxLength={300} rows={2}
                  onChange={(e) => update(item.url, { note: e.target.value })}
                  placeholder="どこをどう直してほしいか（例：顔をもう少し隠してほしい）" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card><CardContent className="p-3 space-y-2">
        <p className="text-xs font-semibold">全体へのひとこと（任意）</p>
        <Textarea value={note} disabled={!pending} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)}
          placeholder="例：全体的にもう少し明るくしてほしいです" />
        {pending && (
          <Button type="button" className="w-full" onClick={submit} disabled={sending}>
            {sending ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Send size={16} className="mr-1" />}お店に返事を送る
          </Button>
        )}
      </CardContent></Card>
    </div>
  );
}
