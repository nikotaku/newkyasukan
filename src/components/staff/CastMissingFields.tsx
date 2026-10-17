import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { castProfileCompletion, isStageNamePending, type CastProfileFields } from "@/lib/castProfileCompletion";
import { therapistProfileFormUrl } from "@/lib/therapistProfileForm";

type EditableCast = CastProfileFields & { access_token?: string | null };

/**
 * セラピスト編集の「未入力」タブ：プロフィールの足りない項目だけを並べて、その場で入れる。
 * 入れた内容は編集中のデータに入り、下の「保存する」でまとめて保存する。
 */
export function CastMissingFields({
  cast,
  onChange,
  onGoToTab,
}: {
  cast: EditableCast;
  onChange: (patch: Partial<EditableCast>) => void;
  onGoToTab: (tab: string) => void;
}) {
  const { toast } = useToast();
  // 開いたときに足りなかった項目は、入れ終わっても欄を消さない（入れている途中で欄が消えないように）
  const [initialMissing] = useState(() => new Set(castProfileCompletion(cast).missing));
  const completion = castProfileCompletion(cast);
  const show = (label: string) => initialMissing.has(label);
  const done = (label: string) => !completion.missing.includes(label);
  const mark = (label: string) => (done(label) ? <span className="ml-1 text-emerald-600">✓</span> : null);

  const text = (key: keyof EditableCast, label: string, opts?: { placeholder?: string; area?: boolean }) =>
    show(label) && (
      <div key={label}>
        <Label className="text-xs">{label}{mark(label)}</Label>
        {opts?.area ? (
          <Textarea rows={2} placeholder={opts.placeholder} value={String(cast[key] ?? "")} onChange={(e) => onChange({ [key]: e.target.value })} />
        ) : (
          <Input placeholder={opts?.placeholder} value={String(cast[key] ?? "")} onChange={(e) => onChange({ [key]: e.target.value })} />
        )}
      </div>
    );

  const num = (key: "age" | "height" | "bust" | "waist" | "hip", placeholder: string, label?: string) => (
    <Input
      key={key}
      inputMode="numeric"
      aria-label={label ?? key}
      placeholder={placeholder}
      value={cast[key] ?? ""}
      onChange={(e) => onChange({ [key]: parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || null })}
    />
  );

  const copyProfileLink = async () => {
    if (!cast.access_token) {
      toast({ title: "マイページのURLがまだありません", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(therapistProfileFormUrl(window.location.origin, cast.access_token));
      toast({ title: "プロフィール入力のURLをコピーしました", description: "LINEなどで本人に送ってください。送られた内容はここに届きます" });
    } catch {
      toast({ title: "コピーできませんでした", variant: "destructive" });
    }
  };

  if (initialMissing.size === 0) {
    return <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">プロフィールはすべて入力済みです 🎉</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span>
            足りない項目だけ出しています（いま <span className="font-semibold">{completion.percent}%</span>）
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 bg-white px-2 text-xs" onClick={() => void copyProfileLink()}>
            <Copy className="mr-1 h-3 w-3" />本人に入力してもらう
          </Button>
        </div>
      </div>

      {show("源氏名") && (
        <div>
          <Label className="text-xs">源氏名{mark("源氏名")}</Label>
          <Input
            placeholder="例：さくら"
            value={isStageNamePending(cast.name) ? "" : cast.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
      )}
      {text("real_name", "本名", { placeholder: "例：佐藤 花子" })}
      {show("写真") && (
        <div className="flex items-center justify-between rounded-md border p-2 text-sm">
          <span>写真{mark("写真")}</span>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onGoToTab("photos")}>写真を入れる →</Button>
        </div>
      )}
      {(show("年齢") || show("身長")) && (
        <div className="grid grid-cols-2 gap-2">
          {show("年齢") && <div><Label className="text-xs">年齢{mark("年齢")}</Label>{num("age", "24", "年齢")}</div>}
          {show("身長") && <div><Label className="text-xs">身長（cm）{mark("身長")}</Label>{num("height", "158", "身長")}</div>}
        </div>
      )}
      {show("スリーサイズ") && (
        <div>
          <Label className="text-xs">スリーサイズ（B / W / H）{mark("スリーサイズ")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {num("bust", "84", "バスト")}
            {num("waist", "58", "ウエスト")}
            {num("hip", "84", "ヒップ")}
          </div>
        </div>
      )}
      {show("カップ") && (
        <div>
          <Label className="text-xs">カップ{mark("カップ")}</Label>
          <Input placeholder="D" value={cast.bust_size ?? cast.cup_size ?? ""} onChange={(e) => onChange({ bust_size: e.target.value, cup_size: e.target.value })} />
        </div>
      )}
      {text("therapist_experience", "セラピスト歴", { placeholder: "2年・未経験 など" })}
      {text("favorite_techniques", "得意な施術")}
      {text("favorite_food", "好きな食べ物")}
      {text("ideal_type", "好きな男性のタイプ")}
      {text("celebrity_lookalike", "似ている芸能人")}
      {text("day_off_activities", "休みの日")}
      {text("hobbies", "趣味・特技")}
      {show("セラピストコメント") && (
        <div>
          <Label className="text-xs">セラピストコメント{mark("セラピストコメント")}</Label>
          <Textarea
            rows={3}
            value={cast.therapist_comment ?? cast.profile ?? ""}
            onChange={(e) => onChange({ therapist_comment: e.target.value, profile: e.target.value })}
          />
        </div>
      )}
      {text("shop_comment", "お店からのコメント", { area: true })}
    </div>
  );
}
