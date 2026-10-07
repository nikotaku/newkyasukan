import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_QUOTA_CONFIG,
  emptyTargets,
  normalizeQuotaConfig,
  QUOTA_CHANNELS,
  type QuotaChannelKey,
  type QuotaConfig,
} from "@/lib/promotionQuota";

const numberInput = "h-9 w-14 px-1 text-center tabular-nums";

/** ノルマの決まり（出勤日数の段階ごとの回数・新人の上乗せ）を変える。保存できるのは店長・オーナー */
export function PromotionQuotaSettingsDialog({
  storeId,
  open,
  config,
  onClose,
  onSaved,
}: {
  storeId: string | null;
  open: boolean;
  config: QuotaConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<QuotaConfig>(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(config);
  }, [config, open]);

  const tierChannels = QUOTA_CHANNELS.filter((channel) => !channel.newcomerOnly);

  const setTierDays = (index: number, value: string) => {
    setDraft((previous) => ({
      ...previous,
      tiers: previous.tiers.map((tier, i) => (i === index ? { ...tier, minDays: Number(value) } : tier)),
    }));
  };
  const setTierTarget = (index: number, key: QuotaChannelKey, value: string) => {
    setDraft((previous) => ({
      ...previous,
      tiers: previous.tiers.map((tier, i) => (i === index ? { ...tier, targets: { ...tier.targets, [key]: Number(value) } } : tier)),
    }));
  };
  const setBonus = (key: QuotaChannelKey, value: string) => {
    setDraft((previous) => ({ ...previous, newcomerBonus: { ...previous.newcomerBonus, [key]: Number(value) } }));
  };
  const addTier = () => {
    setDraft((previous) => {
      const last = previous.tiers[previous.tiers.length - 1];
      const minDays = Math.min((last?.minDays ?? 0) + 5, 31);
      return { ...previous, tiers: [...previous.tiers, { minDays, targets: last ? { ...last.targets } : emptyTargets() }] };
    });
  };
  const removeTier = (index: number) => {
    setDraft((previous) => ({ ...previous, tiers: previous.tiers.filter((_, i) => i !== index) }));
  };

  const save = async () => {
    if (!storeId) return;
    const days = draft.tiers.map((tier) => tier.minDays);
    if (draft.tiers.length === 0) {
      toast.error("段階を1つ以上入れてください");
      return;
    }
    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 31) || new Set(days).size !== days.length) {
      toast.error("出勤日数は1〜31で、段階ごとに別の日数にしてください");
      return;
    }
    const normalized = normalizeQuotaConfig(draft);
    setSaving(true);
    const { error } = await supabase.from("promotion_quota_settings" as never).upsert({
      store_id: storeId,
      config: normalized,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    } as never, { onConflict: "store_id" });
    setSaving(false);
    if (error) {
      toast.error(/row-level security/i.test(error.message)
        ? "決まりを変えられるのは店長・オーナーだけです"
        : `保存できませんでした：${error.message}`);
      return;
    }
    toast.success("ノルマの決まりを保存しました");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>ノルマの決まり</DialogTitle>
          <DialogDescription>
            その月の出勤日数ごとに、媒体ごとの最低回数を決めます（月あたり）。新人は入店からの日数と、新人月に上乗せする回数を決めます。
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 text-left font-medium">出勤日数</th>
                {tierChannels.map((channel) => (
                  <th key={channel.key} className="px-1 py-1.5 text-center font-medium whitespace-nowrap">{channel.short}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.tiers.map((tier, index) => (
                <tr key={index} className="border-t">
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        className={numberInput}
                        value={Number.isFinite(tier.minDays) ? tier.minDays : ""}
                        onChange={(event) => setTierDays(index, event.target.value)}
                        aria-label={`段階${index + 1}の出勤日数`}
                      />
                      日以上
                    </div>
                  </td>
                  {tierChannels.map((channel) => (
                    <td key={channel.key} className="px-1 py-1.5 text-center">
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        className={numberInput}
                        value={Number.isFinite(tier.targets[channel.key]) ? tier.targets[channel.key] : ""}
                        onChange={(event) => setTierTarget(index, channel.key, event.target.value)}
                        aria-label={`${tier.minDays}日以上の${channel.label}`}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pl-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTier(index)} aria-label="この段階を消す">
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addTier} disabled={draft.tiers.length >= 8}>
          <Plus size={14} className="mr-1" />段階を追加
        </Button>

        <div className="space-y-2 rounded-lg border bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            新人：入店から
            <Input
              type="number"
              min={1}
              max={90}
              className={numberInput}
              value={Number.isFinite(draft.newcomerDays) ? draft.newcomerDays : ""}
              onChange={(event) => setDraft((previous) => ({ ...previous, newcomerDays: Number(event.target.value) }))}
              aria-label="新人とする日数"
            />
            日。新人月に上乗せする回数
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUOTA_CHANNELS.map((channel) => (
              <label key={channel.key} className="space-y-1 text-center text-[11px] text-muted-foreground">
                <span className="block whitespace-nowrap">{channel.short}</span>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  className={`${numberInput} mx-auto`}
                  value={Number.isFinite(draft.newcomerBonus[channel.key]) ? draft.newcomerBonus[channel.key] : ""}
                  onChange={(event) => setBonus(channel.key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">HPトップバナーは新人だけの枠なので、ここでだけ決めます。</p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setDraft(DEFAULT_QUOTA_CONFIG)}>既定に戻す</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>キャンセル</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 size={15} className="mr-1.5 animate-spin" />}保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
