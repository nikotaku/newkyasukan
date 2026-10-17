import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  THERAPIST_PROFILE_FIELDS,
  cleanProfileValues,
  type TherapistProfileValues,
} from "@/lib/therapistProfileForm";

type FormState = {
  current: TherapistProfileValues;
  pending: { fields: TherapistProfileValues; submitted_at: string } | null;
  last_reviewed: { status: "applied" | "rejected"; reviewed_at: string | null } | null;
};

const toText = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** マイページ「プロフィール入力」：本人がインタビューの項目を入れて、お店に送る（お店が確認してHPに反映） */
export function TherapistProfileForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<FormState | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_therapist_profile_form" as never, { p_token: token } as never);
    setLoading(false);
    if (error || !data) {
      toast.error("プロフィールを読み込めませんでした");
      return;
    }
    const next = data as unknown as FormState;
    setState(next);
    // 確認待ちがあればその内容、なければいまのプロフィールから始める
    const base = { ...next.current, ...(next.pending?.fields ?? {}) };
    setValues(Object.fromEntries(THERAPIST_PROFILE_FIELDS.map((f) => [f.key, toText(base[f.key])])));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const fields = cleanProfileValues(values);
    if (Object.keys(fields).length === 0) {
      toast.error("どれか1つ以上入れてください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("submit_therapist_profile" as never, { p_token: token, p_fields: fields } as never);
    setSaving(false);
    if (error) {
      toast.error(`送れませんでした：${error.message}`);
      return;
    }
    toast.success("お店に送りました。確認してHPに反映します");
    void load();
  };

  if (loading && !state) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      <Card>
        <CardContent className="space-y-1 pt-4 text-sm">
          <p className="font-semibold">プロフィールを入力してください</p>
          <p className="text-xs text-muted-foreground">
            HPやエステ魂のプロフィールに載る内容です。分かるところだけでOK。送るとお店が確認して反映します。
          </p>
          {state?.pending && (
            <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
              お店の確認待ちです（{new Date(state.pending.submitted_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} に送信）。直して送り直すこともできます
            </p>
          )}
          {!state?.pending && state?.last_reviewed?.status === "applied" && (
            <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">前回の内容はHPに反映されました</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid grid-cols-3 gap-2">
            {THERAPIST_PROFILE_FIELDS.filter((f) => ["age", "height", "cup_size"].includes(f.key)).map((field) => (
              <div key={field.key}>
                <Label className="text-xs">{field.label}{field.unit ? `（${field.unit}）` : ""}</Label>
                <Input
                  inputMode={field.kind === "number" ? "numeric" : undefined}
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs">スリーサイズ（B / W / H）</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["bust", "waist", "hip"] as const).map((key) => (
                <Input
                  key={key}
                  inputMode="numeric"
                  placeholder={THERAPIST_PROFILE_FIELDS.find((f) => f.key === key)?.placeholder}
                  aria-label={THERAPIST_PROFILE_FIELDS.find((f) => f.key === key)?.label}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              ))}
            </div>
          </div>
          {THERAPIST_PROFILE_FIELDS.filter((f) => !["age", "height", "cup_size", "bust", "waist", "hip"].includes(f.key)).map((field) => (
            <div key={field.key}>
              <Label className="text-xs">{field.label}</Label>
              {field.kind === "textarea" ? (
                <Textarea
                  rows={3}
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              ) : (
                <Input
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <Button className="mx-auto block w-full max-w-lg" disabled={saving} onClick={() => void submit()}>
          {saving ? "送信中..." : state?.pending ? "送り直す" : "お店に送る"}
        </Button>
      </div>
    </div>
  );
}
