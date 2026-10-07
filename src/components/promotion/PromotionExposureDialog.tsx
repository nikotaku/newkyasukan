import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { currentBusinessDate } from "@/hooks/usePromotionQuota";
import {
  monthOf,
  QUOTA_CHANNELS,
  type QuotaChannelKey,
  type QuotaItemSource,
  type QuotaPlanInput,
  type QuotaRow,
} from "@/lib/promotionQuota";

export interface ExposureDialogTarget {
  castId: string | null;
  channel: QuotaChannelKey | null;
}

const SOURCE_LABEL: Record<QuotaItemSource, string> = {
  manual: "記録",
  plan: "企画",
  hp_news: "HPニュース（自動）",
  x: "X運用表（自動）",
};

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const shortDate = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
};

const safeUrl = (value: string | null) => (value && /^https?:\/\//.test(value) ? value : null);

/** マスの中身（何で数えたか）を見て、露出を記録する。記録したものはここから消せる */
export function PromotionExposureDialog({
  storeId,
  month,
  target,
  rows,
  plans,
  onClose,
  onChanged,
}: {
  storeId: string | null;
  month: string;
  target: ExposureDialogTarget | null;
  rows: QuotaRow[];
  plans: QuotaPlanInput[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [castId, setCastId] = useState("");
  const [channel, setChannel] = useState<QuotaChannelKey>("x_post");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [planId, setPlanId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const today = currentBusinessDate();
    setCastId(target.castId ?? rows.find((row) => row.required > 0)?.castId ?? rows[0]?.castId ?? "");
    setChannel(target.channel ?? "x_post");
    setDate(monthOf(today) === month ? today : `${month}-01`);
    setNote("");
    setUrl("");
    setPlanId("");
  }, [month, rows, target]);

  const fixed = Boolean(target?.castId && target?.channel);
  const row = rows.find((item) => item.castId === castId) ?? null;
  const cell = row ? row.cells[channel] : null;
  const channelInfo = QUOTA_CHANNELS.find((item) => item.key === channel)!;
  const castPlans = useMemo(() => plans.filter((plan) => (plan.cast_ids ?? []).includes(castId)), [castId, plans]);

  const save = async () => {
    if (!storeId || !castId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("日付を入れてください");
      return;
    }
    const trimmedUrl = url.trim();
    if (trimmedUrl && !/^https?:\/\//.test(trimmedUrl)) {
      toast.error("URLは https:// から入れてください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("promotion_exposures" as never).insert({
      store_id: storeId,
      cast_id: castId,
      channel_key: channel,
      exposed_on: date,
      note: note.trim() || null,
      url: trimmedUrl || null,
      plan_id: planId || null,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(`記録できませんでした：${error.message}`);
      return;
    }
    toast.success(`${row?.name ?? ""} の${channelInfo.label}を記録しました`);
    setNote("");
    setUrl("");
    onChanged();
    if (!fixed) onClose();
  };

  const remove = async (exposureId: string) => {
    if (!storeId) return;
    setDeletingId(exposureId);
    const { error } = await supabase
      .from("promotion_exposures" as never)
      .delete()
      .eq("id", exposureId)
      .eq("store_id", storeId);
    setDeletingId(null);
    if (error) {
      toast.error(`消せませんでした：${error.message}`);
      return;
    }
    toast.success("記録を消しました");
    onChanged();
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fixed && row ? `${row.name}：${channelInfo.label}` : "露出を記録"}</DialogTitle>
          <DialogDescription>
            {fixed && cell
              ? cell.required > 0
                ? `この月の必要回数 ${cell.required}回・実績 ${cell.done}回${cell.planned ? `・企画の予定 ${cell.planned}回` : ""}（今日までの目安 ${cell.expected}回）`
                : `この月はノルマなし・実績 ${cell.done}回`
              : "投稿・掲載したものを1件ずつ記録します。企画の完了した投稿・HPニュース・X運用表の投稿は自動で数えるので、ここでは記録しなくて大丈夫です。"}
          </DialogDescription>
        </DialogHeader>

        {fixed && cell && (
          <div className="space-y-1.5">
            {cell.items.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">まだ実績はありません</p>
            ) : cell.items.map((item, index) => (
              <div key={`${item.source}-${item.exposureId ?? index}`} className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${item.planned ? "border-dashed bg-sky-50/50" : ""}`}>
                <span className="w-10 shrink-0 pt-0.5 font-semibold tabular-nums">{shortDate(item.date)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{SOURCE_LABEL[item.source]}</Badge>
                    {item.planned && <Badge className="h-5 bg-sky-100 px-1.5 text-[10px] text-sky-700 hover:bg-sky-100">予定（未完了）</Badge>}
                  </div>
                  <p className="mt-0.5 break-words">{item.label}</p>
                  {safeUrl(item.url) && (
                    <a href={safeUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">
                      開く<ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {item.exposureId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void remove(item.exposureId!)}
                    disabled={deletingId === item.exposureId}
                    aria-label="この記録を消す"
                  >
                    {deletingId === item.exposureId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                )}
              </div>
            ))}
            {channelInfo.auto && (
              <p className="text-[11px] text-muted-foreground">自動で数えるもの：{channelInfo.auto}</p>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          {fixed ? (
            <p className="text-sm font-bold">記録を追加</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="exposure-cast">セラピスト</Label>
                <select id="exposure-cast" className={selectClass} value={castId} onChange={(event) => setCastId(event.target.value)}>
                  {rows.map((item) => (
                    <option key={item.castId} value={item.castId}>{item.name}（出勤{item.shiftDays}日）</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exposure-channel">媒体</Label>
                <select
                  id="exposure-channel"
                  className={selectClass}
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as QuotaChannelKey)}
                >
                  {QUOTA_CHANNELS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}{item.newcomerOnly ? "（新人）" : ""}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exposure-date">日付</Label>
              <Input id="exposure-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            {castPlans.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="exposure-plan">企画（任意）</Label>
                <select id="exposure-plan" className={selectClass} value={planId} onChange={(event) => setPlanId(event.target.value)}>
                  <option value="">企画に付けない</option>
                  {castPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exposure-note">メモ（任意）</Label>
            <Input id="exposure-note" value={note} maxLength={500} placeholder="例：入店告知・口コミ紹介・バナー差し替え" onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exposure-url">投稿のURL（任意）</Label>
            <Input id="exposure-url" type="url" inputMode="url" value={url} maxLength={1000} placeholder="https://" onChange={(event) => setUrl(event.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button onClick={() => void save()} disabled={saving || !castId}>
            {saving && <Loader2 size={15} className="mr-1.5 animate-spin" />}記録する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
