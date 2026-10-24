import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Bell, CheckCircle2, ChevronDown, Loader2, Megaphone, Pin, PinOff, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import {
  NOTICE_TEMPLATES,
  expiresAtFromDate,
  readSummary,
  shiftNoticeText,
  type NoticeCast,
  type NoticeImportance,
  type NoticeKind,
  type TherapistNotice,
} from "@/lib/therapistNotices";
import { nextShiftPeriod, shiftPeriodLabel, shiftPeriodRange } from "@/lib/shiftOpenSlots";

// セラピストへのお知らせ（掲示板）：書いて出すとマイページの「お知らせ」に載り、スマホ通知も届く。
// 誰が「確認しました」を押したかをここで見る。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);

type Half = "first" | "second" | "all";
const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const emptyForm = () => ({
  title: "",
  body: "",
  importance: "normal" as NoticeImportance,
  pinned: false,
  expires: "",
  notify: true,
  kind: "general" as NoticeKind,
  ...(() => { const next = nextShiftPeriod(todayJst()); return { month: next.month, half: next.half as Half }; })(),
});

export default function TherapistNotices() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { storeId } = useAdminStore();
  const navigate = useNavigate();

  const [casts, setCasts] = useState<NoticeCast[]>([]);
  const [notices, setNotices] = useState<TherapistNotice[]>([]);
  const [reads, setReads] = useState<{ notice_id: string; cast_id: string; read_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const period = shiftPeriodRange(form.month, form.half);
  const periodLabel = shiftPeriodLabel(period.start, period.end);

  // シフトのお知らせは、期間を変えたら文面の期間も入れ替える
  const applyShiftKind = (kind: NoticeKind, month = form.month, half = form.half) => {
    if (kind === "general") { setForm((f) => ({ ...f, kind })); return; }
    const range = shiftPeriodRange(month, half);
    const text = shiftNoticeText(kind, shiftPeriodLabel(range.start, range.end));
    setForm((f) => ({ ...f, kind, month, half, title: text.title, body: text.body, importance: "normal" }));
  };
  const [targetMode, setTargetMode] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const [castRes, noticeRes, readRes] = await Promise.all([
      supabase.from("casts").select("id,name").eq("store_id", storeId).eq("is_active", true).order("name"),
      untyped("therapist_notices").select("*").eq("store_id", storeId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
      untyped("therapist_notice_reads").select("notice_id,cast_id,read_at").eq("store_id", storeId),
    ]);
    setCasts((castRes.data as NoticeCast[] | null) ?? []);
    setNotices((noticeRes.data as TherapistNotice[] | null) ?? []);
    setReads(readRes.data ?? []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(
    () => [...notices].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)),
    [notices],
  );

  const post = async () => {
    if (!storeId) return;
    if (!form.title.trim()) { toast.error("タイトルを入れてください"); return; }
    if (targetMode === "pick" && picked.length === 0) { toast.error("お知らせする人を選んでください"); return; }
    setPosting(true);
    const { error } = await supabase.rpc("post_therapist_notice" as never, {
      p_store_id: storeId,
      p_title: form.title.trim(),
      p_body: form.body.trim(),
      p_importance: form.importance,
      p_cast_ids: targetMode === "pick" ? picked : null,
      p_pinned: form.pinned,
      p_expires_at: form.expires ? expiresAtFromDate(form.expires) : null,
      p_notify: form.notify,
      p_kind: form.kind,
      p_period_start: form.kind === "general" ? null : period.start,
      p_period_end: form.kind === "general" ? null : period.end,
    } as never);
    setPosting(false);
    if (error) { toast.error(`出せませんでした: ${error.message}`); return; }
    toast.success(form.notify ? "お知らせを出しました。マイページへスマホ通知も送っています" : "お知らせを出しました");
    setForm(emptyForm());
    setPicked([]);
    setTargetMode("all");
    void load();
  };

  const update = async (notice: TherapistNotice, patch: Partial<TherapistNotice>, message: string) => {
    const { error } = await untyped("therapist_notices").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", notice.id);
    if (error) { toast.error(`保存できませんでした: ${error.message}`); return; }
    toast.success(message);
    void load();
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px]">
        <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold"><Megaphone size={20} />セラピストへのお知らせ</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              書いて出すと、セラピストのマイページの「お知らせ」に載り、スマホ通知も届きます。誰が「確認しました」を押したかは下の一覧で見られます。
            </p>
          </div>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap gap-1.5">
                {NOTICE_TEMPLATES.map((template) => (
                  <Button key={template.label} type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => template.kind
                      ? applyShiftKind(template.kind)
                      : setForm((f) => ({ ...f, kind: "general", title: template.title || f.title, body: template.body || f.body, importance: template.importance }))}>
                    {template.label}
                  </Button>
                ))}
              </div>
              {form.kind !== "general" && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-semibold">
                    {form.kind === "shift_confirmed" ? "シフト確定のお知らせ" : "シフト提出のお願い"}：対象の期間
                    <button type="button" className="ml-2 font-normal text-muted-foreground underline" onClick={() => applyShiftKind("general")}>ふつうのお知らせにする</button>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input type="month" className="h-9 w-40" value={form.month}
                      onChange={(e) => e.target.value && applyShiftKind(form.kind, e.target.value, form.half)} />
                    {([["first", "前期（1〜15日）"], ["second", "後期（16日〜）"], ["all", "1か月"]] as const).map(([half, label]) => (
                      <Button key={half} type="button" size="sm" variant={form.half === half ? "default" : "outline"}
                        onClick={() => applyShiftKind(form.kind, form.month, half)}>{label}</Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    マイページのお知らせに「{periodLabel}の空きシフトを確認」{form.kind === "shift_confirmed" ? "「追加提出する」" : "「シフトを提出する」"}のボタンが付きます。
                  </p>
                </div>
              )}
              <div>
                <Label className="text-xs">タイトル</Label>
                <Input className="mt-1" maxLength={80} placeholder="例：ルームの清掃について" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">本文</Label>
                <Textarea className="mt-1" rows={5} maxLength={2000} placeholder="伝えたいこと" value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span>⚠️ 大事なお知らせ（赤で目立たせる）</span>
                  <Switch checked={form.importance === "important"} onCheckedChange={(v) => setForm((f) => ({ ...f, importance: v ? "important" : "normal" }))} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span>📌 いちばん上に固定</span>
                  <Switch checked={form.pinned} onCheckedChange={(v) => setForm((f) => ({ ...f, pinned: v }))} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span>📲 スマホ通知も送る</span>
                  <Switch checked={form.notify} onCheckedChange={(v) => setForm((f) => ({ ...f, notify: v }))} />
                </label>
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  <span className="shrink-0">掲載期限</span>
                  <Input type="date" className="h-8 w-40" value={form.expires} onChange={(e) => setForm((f) => ({ ...f, expires: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">お知らせする人</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={targetMode === "all" ? "default" : "outline"} onClick={() => setTargetMode("all")}>
                    在籍の全員（{casts.length}人）
                  </Button>
                  <Button type="button" size="sm" variant={targetMode === "pick" ? "default" : "outline"} onClick={() => setTargetMode("pick")}>
                    選んだ人だけ{targetMode === "pick" ? `（${picked.length}人）` : ""}
                  </Button>
                </div>
                {targetMode === "pick" && (
                  <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3">
                    {casts.map((cast) => (
                      <label key={cast.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                        <Checkbox checked={picked.includes(cast.id)}
                          onCheckedChange={(v) => setPicked((prev) => (v === true ? [...prev, cast.id] : prev.filter((id) => id !== cast.id)))} />
                        <span className="truncate">{cast.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={() => void post()} disabled={posting || !storeId} className="w-full sm:w-auto">
                {posting ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Send size={16} className="mr-1.5" />}お知らせを出す
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground">出したお知らせ</h2>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
            ) : sorted.length === 0 ? (
              <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">まだお知らせはありません</p>
            ) : sorted.map((notice) => {
              const summary = readSummary(notice, casts, reads);
              const expired = notice.expires_at ? new Date(notice.expires_at) < new Date() : false;
              const open = openId === notice.id;
              return (
                <Card key={notice.id} className={notice.importance === "important" ? "border-rose-300" : ""}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {notice.pinned && <Pin size={13} className="text-primary" />}
                          {notice.importance === "important" && <Badge variant="destructive" className="text-[10px]">大事</Badge>}
                          {notice.kind && notice.kind !== "general" && notice.period_start && notice.period_end && (
                            <Badge variant="secondary" className="text-[10px]">
                              {notice.kind === "shift_confirmed" ? "シフト確定" : "シフト提出"}・{shiftPeriodLabel(notice.period_start, notice.period_end)}
                            </Badge>
                          )}
                          {expired && <Badge variant="secondary" className="text-[10px]">掲載終了</Badge>}
                          <p className="font-semibold">{notice.title}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(new Date(notice.created_at), "M/d HH:mm")}
                          {notice.target_cast_ids?.length ? `・${summary.total}人あて` : "・全員あて"}
                          {notice.expires_at && `・${format(new Date(notice.expires_at), "M/d")}まで`}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={notice.pinned ? "固定をやめる" : "いちばん上に固定"}
                        onClick={() => void update(notice, { pinned: !notice.pinned }, notice.pinned ? "固定をやめました" : "いちばん上に固定しました")}>
                        {notice.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="消す"
                        onClick={() => { if (confirm("このお知らせを消しますか？（マイページからも消えます）")) void update(notice, { deleted_at: new Date().toISOString() }, "消しました"); }}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    {notice.body && <p className="whitespace-pre-wrap text-sm">{notice.body}</p>}
                    <button type="button" onClick={() => setOpenId(open ? null : notice.id)}
                      className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left text-xs">
                      <CheckCircle2 size={14} className={summary.unread.length === 0 ? "text-emerald-600" : "text-muted-foreground"} />
                      <span className="font-semibold">確認済み {summary.read.length}/{summary.total}人</span>
                      {summary.unread.length > 0 && <span className="text-rose-600">まだ {summary.unread.length}人</span>}
                      <ChevronDown size={14} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <p className="mb-1 font-semibold text-rose-600">まだ確認していない</p>
                          <p className="text-muted-foreground">{summary.unread.map((c) => c.name).join("、") || "なし"}</p>
                        </div>
                        <div>
                          <p className="mb-1 font-semibold text-emerald-700">確認した</p>
                          <p className="text-muted-foreground">{summary.read.map((c) => c.name).join("、") || "なし"}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bell size={13} />スマホ通知はマイページで通知をオンにした人に届きます（まだの人は本人のLINEグループへ）。届かなくてもマイページを開くと出ます。
          </p>
        </div>
      </main>
    </div>
  );
}
