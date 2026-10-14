import { useEffect, useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getCastBookingUrl } from "@/lib/bookingUrl";
import { buildDraftRequest, type DraftFacts } from "@/lib/promotionTaskDraft";
import { formatShiftBreak } from "@/lib/shiftBreak";

// 企画スケジュールのタスクの「投稿文を作る」。AI（generate-cast-content の x_post）が下書きを作り、手直しして保存・コピーする。

export interface DraftTask {
  id: string;
  label: string;
  channel_key: string | null;
  group_label: string | null;
  scheduled_on: string | null;
  draft_text?: string | null;
}

interface Props {
  task: DraftTask | null;
  storeId: string;
  storeName: string;
  bookingBaseUrl: string;
  plan: { title: string | null; description: string | null; cast_ids: string[] | null; therapist_label: string | null } | null;
  casts: Array<{ id: string; name: string; profile: string | null; message: string | null; linkedCastIds: string[] }>;
  onClose: () => void;
  onSaved: (taskId: string, text: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);

export function PromotionTaskDraftDialog({ task, storeId, storeName, bookingBaseUrl, plan, casts, onClose, onSaved }: Props) {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(task?.draft_text ?? "");
  }, [task?.id, task?.draft_text]);

  const generate = async () => {
    if (!task) return;
    setGenerating(true);
    try {
      const castIds = plan?.cast_ids ?? [];
      const therapists = casts.filter((cast) => cast.linkedCastIds.some((id) => castIds.includes(id)));
      const names = therapists.length
        ? therapists
        : (plan?.therapist_label ?? "").split(/[&＆、,・\s]+/).filter(Boolean).map((name) => ({ id: "", name, profile: null, message: null, linkedCastIds: [] }));

      let shifts: DraftFacts["shifts"] = [];
      if (task.scheduled_on && castIds.length) {
        const { data } = await untyped("shifts")
          .select("cast_id,start_time,end_time,break_start,break_end,approval_status")
          .eq("store_id", storeId)
          .eq("shift_date", task.scheduled_on)
          .in("cast_id", castIds);
        shifts = ((data ?? []) as Array<{ cast_id: string; start_time: string; end_time: string; break_start: string | null; break_end: string | null; approval_status: string | null }>)
          .filter((shift) => shift.approval_status !== "rejected")
          .map((shift) => ({
            name: casts.find((cast) => cast.linkedCastIds.includes(shift.cast_id))?.name ?? "",
            start: shift.start_time.slice(0, 5),
            end: shift.end_time.slice(0, 5),
            breakText: formatShiftBreak(shift) || undefined,
          }));
      }

      const body = buildDraftRequest(task, {
        storeName,
        therapists: names.map((cast) => ({
          name: cast.name,
          profile: cast.profile,
          message: cast.message,
          bookingUrl: cast.linkedCastIds[0] ? getCastBookingUrl(bookingBaseUrl, cast.linkedCastIds[0]) : null,
        })),
        date: task.scheduled_on,
        shifts,
        planTitle: plan?.title,
        planDescription: plan?.description,
      });
      const { data, error } = await supabase.functions.invoke("generate-cast-content", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const content = String(data?.content ?? "").trim();
      if (!content) throw new Error("文章を作れませんでした。もう一度お試しください");
      setText(content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文章を作れませんでした");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!task) return;
    setSaving(true);
    const { error } = await untyped("promotion_plan_tasks")
      .update({ draft_text: text.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("store_id", storeId);
    setSaving(false);
    if (error) {
      toast.error("保存できませんでした");
      return;
    }
    onSaved(task.id, text.trim());
    toast.success("投稿文を保存しました");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("コピーしました。投稿したらチェックを付けてください");
    } catch {
      toast.error("コピーできませんでした");
    }
  };

  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>投稿文を作る</DialogTitle>
          <DialogDescription>{task?.label}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button type="button" variant="outline" className="w-full" onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Sparkles size={16} className="mr-1.5" />}
            {text ? "AIで作り直す" : "AIで下書きを作る"}
          </Button>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder="ここに投稿文が入ります。手直ししてから保存・コピーできます"
          />
          <p className="text-xs text-muted-foreground">
            この日の出勤・セラピストの紹介・予約URLを入れて作ります。数字や名前は、出勤やプロフィールにあるものだけを使います。【◯◯】の所は埋めてから投稿してください。
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => void copy()} disabled={!text.trim()}>
            <Copy size={15} className="mr-1.5" />コピー
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || text.trim() === (task?.draft_text ?? "").trim()}>
            {saving && <Loader2 size={15} className="mr-1.5 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
