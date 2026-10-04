import { useState } from "react";
import { ArrowDown, ArrowUp, Crosshair, DoorOpen, Plus, Save, Trash2, Video, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  ROOM_KEY_TYPES,
  WIFI_SECURITY_OPTIONS,
  isVideoFile,
  normalizeRouteSteps,
  type EntryRouteStep,
  type RoomKeyType,
  type WifiSecurity,
} from "@/lib/roomEntry";
import { EntryRouteSteps } from "./EntryRouteSteps";
import { RoomKeySection } from "./RoomKeySection";
import { WifiConnectCard } from "./WifiConnectCard";

// ルーム管理の「セラピスト向けの入室案内（マイページ）」：鍵の開け方のアニメーション・鍵の場所までの道順・Wi-Fi。

export interface RoomEntryGuideFields {
  key_number: string | null;
  key_type: RoomKeyType | null;
  key_close_code: string | null;
  entry_route_steps: EntryRouteStep[] | null;
  wifi_ssid: string | null;
  wifi_password: string | null;
  wifi_security: WifiSecurity | null;
  show_in_therapist_portal: boolean | null;
}

// Supabase の無料プランでアップロードできる上限
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function RoomEntryGuideEditor({ roomId, value, onChange, onSave, saving }: {
  roomId: string;
  value: RoomEntryGuideFields;
  onChange: (next: Partial<RoomEntryGuideFields>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const steps = value.entry_route_steps || [];
  const setSteps = (next: EntryRouteStep[]) => onChange({ entry_route_steps: next });
  const updateStep = (index: number, patch: Partial<EntryRouteStep>) =>
    setSteps(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  const moveStep = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };

  const uploadStepMedia = async (index: number, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("50MBまでのファイルにしてください（動画は短く切ってください）");
      return;
    }
    setUploadingStep(index);
    try {
      const ext = file.name.split(".").pop() || (isVideoFile(file) ? "mp4" : "jpg");
      const path = `route/${roomId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("entry-photos").upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      const { data } = supabase.storage.from("entry-photos").getPublicUrl(path);
      updateStep(index, isVideoFile(file)
        ? { video_url: data.publicUrl, image_url: null, focus: null }
        : { image_url: data.publicUrl, video_url: null });
    } catch (error) {
      console.error(error);
      toast.error("アップロードに失敗しました");
    } finally {
      setUploadingStep(null);
    }
  };

  const pickFocus = (index: number, event: React.MouseEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
    updateStep(index, { focus: { x, y, zoom: steps[index].focus?.zoom ?? 2 } });
  };

  const previewSteps = normalizeRouteSteps(steps);
  const keyType = value.key_type ?? "none";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><DoorOpen size={16} />セラピスト向けの入室案内（マイページ）</CardTitle>
        <p className="text-xs text-muted-foreground">
          セラピストのマイページ「入室方法」に、鍵の場所までの道順・鍵の開け方のアニメーション・Wi-Fi を出します。
          番号やパスワードは、マイページのURLを持っている本人にだけ見えます（お客様の予約案内ページには出ません）。
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex items-center justify-between gap-3 rounded-md border p-3">
          <span className="text-sm font-medium">マイページの「入室方法」に出す</span>
          <Switch
            checked={Boolean(value.show_in_therapist_portal)}
            onCheckedChange={(checked) => onChange({ show_in_therapist_portal: checked })}
          />
        </label>

        {/* 鍵の開け方 */}
        <section className="space-y-3">
          <Label className="text-sm font-semibold">鍵の開け方</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {ROOM_KEY_TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ key_type: option.value === "none" ? null : option.value })}
                className={`rounded-md border p-2.5 text-left transition-colors ${keyType === option.value ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-[11px] text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">鍵の番号（上の「鍵の番号」と同じ）</Label>
              <Input className="mt-1 font-mono" value={value.key_number || ""} onChange={(e) => onChange({ key_number: e.target.value })} placeholder="例：1234" />
            </div>
            {value.key_type === "dial_lock" && (
              <div>
                <Label className="text-xs">閉めるときに戻す番号</Label>
                <Input className="mt-1 font-mono" value={value.key_close_code || ""} onChange={(e) => onChange({ key_close_code: e.target.value })} placeholder="例：0000" />
              </div>
            )}
          </div>
          {value.key_number && (
            <div className="max-w-md">
              <p className="mb-1 text-xs text-muted-foreground">マイページでの見え方（プレビュー）</p>
              <RoomKeySection keyType={value.key_type} code={value.key_number} closeCode={value.key_close_code} />
            </div>
          )}
        </section>

        {/* 鍵の場所までの道順 */}
        <section className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">鍵の場所（入口）までの道順</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              写真か動画を順に登録します。写真をタップすると、その場所に寄って赤い丸で示すアニメーションになります。動画はそのまま流れます（50MBまで）。
            </p>
          </div>
          {steps.map((step, index) => (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">STEP {index + 1}</Label>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label="上へ">
                    <ArrowUp size={14} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} aria-label="下へ">
                    <ArrowDown size={14} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" onClick={() => setSteps(steps.filter((_, i) => i !== index))} aria-label="削除">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="w-full shrink-0 space-y-1.5 sm:w-56">
                  {step.video_url ? (
                    <video src={step.video_url} className="w-full rounded-md border bg-black" controls muted playsInline preload="metadata" />
                  ) : step.image_url ? (
                    <div className="relative">
                      <img
                        src={step.image_url}
                        alt=""
                        className="block h-auto w-full cursor-crosshair rounded-md border"
                        onClick={(event) => pickFocus(index, event)}
                      />
                      {step.focus && (
                        <span
                          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-red-500 shadow-[0_0_0_2px_rgba(255,255,255,.8)]"
                          style={{ left: `${step.focus.x}%`, top: `${step.focus.y}%` }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">写真・動画なし</div>
                  )}
                  <label className="block cursor-pointer text-center text-xs text-primary">
                    {uploadingStep === index ? "アップロード中..." : step.image_url || step.video_url ? "写真・動画を変更" : "写真・動画を選択"}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      disabled={uploadingStep !== null}
                      onChange={(e) => {
                        void uploadStepMedia(index, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Textarea
                    rows={3}
                    value={step.text || ""}
                    onChange={(e) => updateStep(index, { text: e.target.value })}
                    placeholder="例：建物の右側の細い通路に入ります"
                  />
                  {step.image_url && !step.video_url && (
                    step.focus ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Crosshair size={13} className="text-red-500" />
                        <span>寄る大きさ</span>
                        <input
                          type="range"
                          min={1.2}
                          max={3.5}
                          step={0.1}
                          value={step.focus.zoom}
                          onChange={(e) => updateStep(index, { focus: { ...step.focus!, zoom: Number(e.target.value) } })}
                          className="w-28"
                        />
                        <span className="tabular-nums">{step.focus.zoom.toFixed(1)}倍</span>
                        <button type="button" className="text-muted-foreground underline" onClick={() => updateStep(index, { focus: null })}>寄らない</button>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Crosshair size={13} />写真の見せたい場所をタップすると、そこに寄ります</p>
                    )
                  )}
                  {step.video_url && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Video size={13} />音なしで最後まで流れたら次へ進みます</p>}
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSteps([...steps, { image_url: null, video_url: null, text: "", focus: null }])}>
            <Plus size={14} />ステップを追加
          </Button>
          {previewSteps.length > 0 && (
            <div className="max-w-sm rounded-xl border p-3">
              <p className="mb-2 text-xs text-muted-foreground">マイページでの見え方（プレビュー）</p>
              <EntryRouteSteps steps={previewSteps} />
            </div>
          )}
        </section>

        {/* Wi-Fi */}
        <section className="space-y-3">
          <Label className="flex items-center gap-1.5 text-sm font-semibold"><Wifi size={15} />Wi-Fi</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">ネットワーク名（SSID）</Label>
              <Input className="mt-1" value={value.wifi_ssid || ""} onChange={(e) => onChange({ wifi_ssid: e.target.value })} placeholder="ルーターのラベルに書いてあります" />
            </div>
            <div>
              <Label className="text-xs">パスワード</Label>
              <Input className="mt-1 font-mono" value={value.wifi_password || ""} onChange={(e) => onChange({ wifi_password: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">暗号化</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={value.wifi_security || "WPA"}
                onChange={(e) => onChange({ wifi_security: e.target.value as WifiSecurity })}
              >
                {WIFI_SECURITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          {value.wifi_ssid?.trim() && (
            <div className="max-w-md">
              <p className="mb-1 text-xs text-muted-foreground">マイページでの見え方（プレビュー）。QRコードをスマホのカメラで読んで、つながるか確かめてください</p>
              <WifiConnectCard ssid={value.wifi_ssid.trim()} password={value.wifi_password} security={value.wifi_security || "WPA"} />
            </div>
          )}
        </section>

        <Button onClick={onSave} disabled={saving} className="gap-1.5">
          <Save size={15} />{saving ? "保存中..." : "入室案内を保存"}
        </Button>
      </CardContent>
    </Card>
  );
}
