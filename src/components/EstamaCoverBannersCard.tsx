import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

// エステ魂のカバー画像（店舗ページ上部のスライド・3枠）を、HPと同じセラピストのバナーで毎日入れ替える設定。
// 設定は stores.settings.estama_cover_banners（{ enabled, slots }）。ページ右上の「保存」で反映する。
// 動き：server/estama-cover-banners.ts（朝10時以降に1日1回）。記録は estama_cover_rotations。

export interface EstamaCoverBannerSettings {
  enabled: boolean;
  slots: number[];
}

export const DEFAULT_ESTAMA_COVER_SLOTS = [2, 3];

export function parseEstamaCoverSettings(value: unknown): EstamaCoverBannerSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const slots = Array.isArray(raw.slots)
    ? [...new Set(raw.slots.map(Number).filter((slot) => slot >= 1 && slot <= 3))].sort()
    : DEFAULT_ESTAMA_COVER_SLOTS;
  return { enabled: raw.enabled === true, slots: slots.length ? slots : DEFAULT_ESTAMA_COVER_SLOTS };
}

interface Rotation {
  rotation_date: string;
  status: "running" | "done" | "failed" | "skipped";
  attempts: number;
  slots: number[];
  cast_names: string[];
  image_urls: string[];
  error: string | null;
  finished_at: string | null;
  requested_at: string | null;
}

const STATUS_LABEL: Record<Rotation["status"], string> = {
  running: "反映中",
  done: "反映済み",
  failed: "反映できませんでした",
  skipped: "そのまま",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

interface Props {
  storeId: string;
  value: EstamaCoverBannerSettings;
  savedEnabled: boolean;
  onChange: (next: EstamaCoverBannerSettings) => void;
}

export function EstamaCoverBannersCard({ storeId, value, savedEnabled, onChange }: Props) {
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await untyped
      .from("estama_cover_rotations")
      .select("rotation_date, status, attempts, slots, cast_names, image_urls, error, finished_at, requested_at")
      .eq("store_id", storeId)
      .order("rotation_date", { ascending: false })
      .limit(7);
    setRotations((data ?? []) as Rotation[]);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const toggleSlot = (slot: number, checked: boolean) => {
    const slots = checked ? [...new Set([...value.slots, slot])].sort() : value.slots.filter((item) => item !== slot);
    if (!slots.length) {
      toast.message("1つ以上の枠を選んでください");
      return;
    }
    onChange({ ...value, slots });
  };

  const requestNow = async () => {
    setRequesting(true);
    const { error } = await untyped.rpc("request_estama_cover_rotation", { p_store_id: storeId });
    setRequesting(false);
    if (error) {
      toast.error(error.message || "依頼できませんでした");
      return;
    }
    toast.success("5分ほどでエステ魂のカバー画像を入れ替えます");
    void load();
  };

  const latest = rotations[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-lg">
          <span className="flex items-center gap-2"><Sparkles size={20} /> エステ魂のカバー画像（自動）</span>
          <Switch
            checked={value.enabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
            aria-label="エステ魂のカバー画像を入れ替える"
          />
        </CardTitle>
        <CardDescription>
          上の「セラピストのバナー」と同じバナー（同じ並び・同じ写真）を、エステ魂の店舗ページ上部のカバー画像にも毎日入れます（朝10時以降に1日1回）。
          「最短◯時〜」は1日の中で変わるので、エステ魂には出しません。出た日は露出ノルマの「エスたまトップバナー」に自動で記録されます。
          切り替えたら右上の「保存」で反映されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">入れ替える枠（エステ魂のカバー画像は3枠）</p>
          <div className="flex flex-wrap gap-4">
            {[1, 2, 3].map((slot) => (
              <label key={slot} className="flex items-center gap-2 text-sm">
                <Checkbox checked={value.slots.includes(slot)} onCheckedChange={(checked) => toggleSlot(slot, checked === true)} />
                {slot}枠目{slot === 1 ? "（SNSで共有したときの画像にもなる）" : ""}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            選ばなかった枠は、エステ魂で入れた画像のまま変わりません。その日のバナーが枠より少ないときは、余った枠もそのままです。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" onClick={() => void requestNow()} disabled={!savedEnabled || requesting}>
            {requesting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
            今日の分を今すぐ反映
          </Button>
          {!savedEnabled && <span className="text-xs text-muted-foreground">オンにして保存すると使えます</span>}
        </div>

        {latest && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              <span className="font-medium">{latest.rotation_date}</span>：
              {latest.requested_at && latest.status !== "running" ? "反映待ち（5分ほど）" : STATUS_LABEL[latest.status]}
              {latest.cast_names.length ? `　${latest.slots.map((slot, index) => `${slot}枠目 ${latest.cast_names[index] ?? ""}`).join("・")}` : ""}
            </p>
            {latest.error && <p className="text-xs text-muted-foreground">{latest.error}</p>}
            {latest.image_urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {latest.image_urls.filter(Boolean).map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="" className="h-16 w-32 rounded border object-cover" />
                  </a>
                ))}
              </div>
            )}
            {rotations.length > 1 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {rotations.slice(1).map((rotation) => (
                  <li key={rotation.rotation_date}>
                    {rotation.rotation_date}：{STATUS_LABEL[rotation.status]}
                    {rotation.cast_names.length ? `（${rotation.cast_names.join("・")}）` : ""}
                    {rotation.status === "failed" && rotation.error ? ` ${rotation.error}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
