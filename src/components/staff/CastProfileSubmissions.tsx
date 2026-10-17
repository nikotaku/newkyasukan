import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  castPatchFromProfile,
  currentProfileValues,
  profileDiff,
  type TherapistProfileValues,
} from "@/lib/therapistProfileForm";

type Submission = {
  id: string;
  cast_id: string;
  fields: TherapistProfileValues;
  submitted_at: string;
};

type CastLite = { id: string; name: string; real_name?: string | null } & Record<string, unknown>;

/**
 * セラピスト本人がマイページから送ったプロフィールの確認。変わる項目を見比べて「反映」すると casts に入る。
 */
export function CastProfileSubmissions({
  storeId,
  casts,
  onApplied,
}: {
  storeId: string | null;
  casts: CastLite[];
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<Submission[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data, error } = await supabase
      .from("cast_profile_submissions" as never)
      .select("id, cast_id, fields, submitted_at")
      .eq("store_id", storeId)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false });
    if (error) {
      console.warn("プロフィールの提出を読めませんでした:", error.message);
      return;
    }
    setItems((data as unknown as Submission[]) ?? []);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (items.length === 0) return null;

  const castOf = (id: string) => casts.find((c) => c.id === id);

  const review = async (item: Submission, apply: boolean) => {
    setBusyId(item.id);
    try {
      if (apply) {
        const patch = castPatchFromProfile(item.fields);
        const { error } = await supabase.from("casts").update(patch as never).eq("id", item.cast_id);
        if (error) throw error;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cast_profile_submissions" as never)
        .update({ status: apply ? "applied" : "rejected", reviewed_at: new Date().toISOString(), reviewed_by: userData.user?.id ?? null } as never)
        .eq("id", item.id);
      if (error) throw error;
      toast({ title: apply ? "プロフィールに反映しました" : "見送りました" });
      setItems((list) => list.filter((x) => x.id !== item.id));
      if (apply) onApplied();
    } catch (error) {
      toast({ title: "できませんでした", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-sky-900">📝 セラピストから届いたプロフィール {items.length}件</span>
        <span className="text-xs text-sky-700">{open ? "閉じる" : "確認する"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {items.map((item) => {
            const cast = castOf(item.cast_id);
            const rows = profileDiff(currentProfileValues(cast ?? {}), item.fields);
            return (
              <div key={item.id} className="rounded-md border bg-white p-2">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold">{cast?.name ?? "（不明）"}{cast?.real_name ? `（${cast.real_name}）` : ""}</span>
                  <span className="text-muted-foreground">
                    {new Date(item.submitted_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">いまのプロフィールと同じ内容です</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-t align-top">
                          <td className="w-24 py-1 pr-2 text-muted-foreground">{row.label}</td>
                          <td className="py-1 pr-2 text-muted-foreground line-through decoration-rose-300">{row.before || "（空）"}</td>
                          <td className="py-1 font-medium text-emerald-800">{row.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="mt-2 flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busyId === item.id} onClick={() => void review(item, false)}>
                    見送る
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-xs" disabled={busyId === item.id} onClick={() => void review(item, true)}>
                    反映する
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
