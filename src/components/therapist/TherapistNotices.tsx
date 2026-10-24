import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarPlus, CalendarSearch, Check, Loader2, Megaphone, Pin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { PortalNotice } from "@/lib/therapistNotices";
import { shiftPeriodLabel } from "@/lib/shiftOpenSlots";

/** お店からのお知らせ（本人あて・新しい順、固定が先） */
export async function fetchTherapistNotices(token: string): Promise<PortalNotice[]> {
  const { data, error } = await supabase.rpc("get_therapist_notices" as never, { p_token: token } as never);
  if (error) throw error;
  return (data as PortalNotice[] | null) ?? [];
}

/** マイページ「お知らせ」：お店からの掲示板。読んだら「確認しました」を押す */
export function TherapistNotices({
  token,
  notices,
  onChange,
  onOpenShifts,
}: {
  token: string;
  notices: PortalNotice[];
  onChange: (notices: PortalNotice[]) => void;
  /** シフトのお知らせの「◯◯の空きシフトを確認」 */
  onOpenShifts: (start: string, end: string) => void;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState<string | null>(null);

  const markRead = async (notice: PortalNotice) => {
    setSaving(notice.id);
    const { data, error } = await supabase.rpc("mark_therapist_notice_read" as never, { p_token: token, p_notice_id: notice.id } as never);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    onChange(notices.map((n) => (n.id === notice.id ? { ...n, read_at: (data as string | null) ?? new Date().toISOString() } : n)));
  };

  if (notices.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        <Megaphone className="mx-auto mb-2 text-muted-foreground/60" />お店からのお知らせはありません
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      {notices.map((notice) => {
        const important = notice.importance === "important";
        return (
          <Card key={notice.id} className={important ? "border-2 border-rose-300" : notice.read_at ? "opacity-80" : "border-primary/40"}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {notice.pinned && <Pin size={13} className="text-primary" />}
                {important && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">大事</span>}
                {!notice.read_at && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">NEW</span>}
                <span className="text-xs text-muted-foreground">{format(new Date(notice.created_at), "M/d HH:mm")}</span>
              </div>
              <p className="font-bold">{notice.title}</p>
              {notice.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{notice.body}</p>}
              {notice.kind && notice.kind !== "general" && notice.period_start && notice.period_end && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" onClick={() => onOpenShifts(notice.period_start!, notice.period_end!)}>
                    <CalendarSearch size={16} className="mr-1" />{shiftPeriodLabel(notice.period_start, notice.period_end)}の空きシフトを確認
                  </Button>
                  <Button type="button" variant="outline"
                    onClick={() => navigate(`/therapist/${token}/shift?from=${notice.period_start}&to=${notice.period_end}`)}>
                    <CalendarPlus size={16} className="mr-1" />{notice.kind === "shift_confirmed" ? "追加提出する" : "シフトを提出する"}
                  </Button>
                </div>
              )}
              {notice.read_at ? (
                <p className="flex items-center gap-1 text-xs text-emerald-700">
                  <Check size={13} />{format(new Date(notice.read_at), "M/d HH:mm")} に確認しました
                </p>
              ) : (
                <Button type="button" className="w-full" onClick={() => void markRead(notice)} disabled={saving === notice.id}>
                  {saving === notice.id ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Check size={16} className="mr-1" />}確認しました
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
