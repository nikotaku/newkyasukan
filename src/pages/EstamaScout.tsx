import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Loader2, RefreshCw, Send, UserSearch, X } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SCOUT_SETTINGS,
  SCOUT_BATCH_STATUS,
  SCOUT_CANDIDATE_STATUS,
  type ScoutBatch,
  type ScoutCandidate,
  type ScoutSettings,
} from "@/lib/estamaScout";

// エステ魂「スカウト求人」の毎日の確認画面。候補がそろうとスマホに通知が来るので、
// ここで送る人を選んで OK → エステ魂のスカウトテンプレートで自動送信される。

const formatDate = (value: string | null) => {
  if (!value) return "";
  const [, m, d] = value.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${value}T00:00:00+09:00`).getDay()];
  return `${m}/${d}(${weekday})`;
};
const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

// 新しい表・RPCは生成済みの型にまだ無いので、名前だけで呼ぶ
const table = (name: string) => supabase.from(name as never);
const callRpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);

export default function EstamaScout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { store } = useAdminStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<ScoutSettings>(DEFAULT_SCOUT_SETTINGS);
  const [settingsSaved, setSettingsSaved] = useState(true);
  const [batches, setBatches] = useState<ScoutBatch[]>([]);
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"approve" | "cancel" | "collect" | "save" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const current = batches[0] ?? null;

  const load = useCallback(async () => {
    if (!store?.id) return;
    const [{ data: settingsRow }, { data: batchRows }] = await Promise.all([
      table("estama_scout_settings").select("*").eq("store_id" as never, store.id as never).maybeSingle(),
      table("estama_scout_batches").select("*").eq("store_id" as never, store.id as never).order("scout_date" as never, { ascending: false }).limit(14),
    ]);
    if (settingsRow) {
      setSettings({ ...DEFAULT_SCOUT_SETTINGS, ...(settingsRow as unknown as Partial<ScoutSettings>) });
      setSettingsSaved(true);
    }
    const list = (batchRows as unknown as ScoutBatch[] | null) ?? [];
    setBatches(list);
    if (list[0]) {
      const { data: candidateRows } = await table("estama_scout_candidates")
        .select("*")
        .eq("batch_id" as never, list[0].id as never)
        .order("position" as never, { ascending: true });
      const rows = (candidateRows as unknown as ScoutCandidate[] | null) ?? [];
      setCandidates(rows);
      setSelected((previous) => {
        // OK待ちの間は、外したチェックを保ったまま新しい候補だけ選んだ状態にする
        const proposed = rows.filter((row) => row.status === "proposed").map((row) => row.id);
        if (previous.size && proposed.some((id) => previous.has(id))) return new Set(proposed.filter((id) => previous.has(id)));
        return new Set(proposed);
      });
    } else {
      setCandidates([]);
      setSelected(new Set());
    }
    setLoading(false);
  }, [store?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 候補集め・送信中は画面を開いたまま進み具合が見えるよう読み直す
  useEffect(() => {
    if (!current || !["collecting", "approved", "sending"].includes(current.status)) return;
    const timer = window.setInterval(load, 8_000);
    return () => window.clearInterval(timer);
  }, [current, load]);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
      toast({ title: "できませんでした", description: message, variant: "destructive" });
    } finally {
      setBusy(null);
      load();
    }
  };

  const approve = () => run("approve", async () => {
    if (!current) return;
    const { error } = await callRpc("approve_estama_scout_batch", { p_batch_id: current.id, p_candidate_ids: Array.from(selected) });
    if (error) throw error;
    toast({ title: `${selected.size}人にスカウトを送ります`, description: "数分で送り終わります。終わったら通知でお知らせします" });
  });

  const cancel = () => run("cancel", async () => {
    if (!current) return;
    const { error } = await callRpc("cancel_estama_scout_batch", { p_batch_id: current.id });
    if (error) throw error;
    toast({ title: "今日のスカウトは送りません" });
  });

  const collectNow = () => run("collect", async () => {
    if (!store?.id) return;
    const { error } = await callRpc("request_estama_scout_candidates", { p_store_id: store.id });
    if (error) throw error;
    toast({ title: "候補を集めています", description: "1〜2分でこの画面に出ます。スマホにも通知します" });
  });

  const saveSettings = () => run("save", async () => {
    if (!store?.id) return;
    const areas = settings.preferred_areas.map((area) => area.trim()).filter(Boolean);
    const { error } = await table("estama_scout_settings").upsert({
      store_id: store.id,
      enabled: settings.enabled,
      daily_count: Math.min(30, Math.max(1, Math.round(settings.daily_count || 10))),
      propose_at: settings.propose_at,
      template_name: settings.template_name?.trim() || null,
      preferred_areas: areas,
      only_preferred: settings.only_preferred,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    } as never, { onConflict: "store_id" });
    if (error) throw error;
    toast({ title: "設定を保存しました" });
  });

  const updateSettings = (patch: Partial<ScoutSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
    setSettingsSaved(false);
  };

  const proposed = useMemo(() => candidates.filter((candidate) => candidate.status === "proposed"), [candidates]);
  const status = current ? SCOUT_BATCH_STATUS[current.status] : null;
  const isToday = current?.scout_date === new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const canCollect = !current || !isToday || ["empty", "failed", "cancelled"].includes(current.status);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4 mt-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><UserSearch size={20} />エステ魂スカウト</h1>
            <p className="text-sm text-muted-foreground mt-1">
              毎日決まった時刻に、エステ魂の「スカウト求人」から送る候補を集めてスマホに通知します。
              ここで送る人を確認して「送る」を押すと、エステ魂のスカウトテンプレートで自動送信します。
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              通知は <Link to="/settings/notifications" className="underline inline-flex items-center gap-0.5"><Bell size={12} />スマホ通知の設定</Link> で「エステ魂スカウトの確認」をオンにした端末に届きます。
            </p>
          </div>

          <Card className={current?.status === "pending_approval" ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                {current ? `${formatDate(current.scout_date)}のスカウト` : "スカウト"}
                {status && <Badge variant={status.tone}>{status.label}</Badge>}
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={load} aria-label="読み直す">
                  <RefreshCw size={14} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" />読み込み中</p>
              ) : !current ? (
                <p className="text-sm text-muted-foreground">まだ候補を集めていません。</p>
              ) : (
                <>
                  {status?.hint && <p className="text-sm text-muted-foreground">{status.hint}</p>}
                  {current.error_message && <p className="text-sm text-destructive">{current.error_message}</p>}
                  {current.status === "pending_approval" && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>チェックを外した人には送りません</span>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setSelected(selected.size === proposed.length ? new Set() : new Set(proposed.map((candidate) => candidate.id)))}
                      >
                        {selected.size === proposed.length ? "全部外す" : "全部選ぶ"}
                      </button>
                    </div>
                  )}
                  <ul className="divide-y rounded-md border">
                    {candidates.map((candidate) => {
                      const candidateStatus = SCOUT_CANDIDATE_STATUS[candidate.status];
                      const attributes = candidate.attributes ?? {};
                      const editable = current.status === "pending_approval" && candidate.status === "proposed";
                      return (
                        <li key={candidate.id} className="flex items-start gap-3 p-3">
                          {editable && (
                            <Checkbox
                              className="mt-0.5"
                              checked={selected.has(candidate.id)}
                              onCheckedChange={(on) => setSelected((previous) => {
                                const next = new Set(previous);
                                if (on) next.add(candidate.id);
                                else next.delete(candidate.id);
                                return next;
                              })}
                              aria-label={`${candidate.display_name ?? "候補"}に送る`}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">{candidate.display_name || "（名前なし）"}</span>
                              {attributes.age && <span className="text-xs text-muted-foreground">{attributes.age}歳</span>}
                              {attributes.preferred && <Badge variant="secondary" className="text-[10px]">近くのエリア</Badge>}
                              {!editable && candidateStatus && <Badge variant={candidateStatus.tone} className="text-[10px]">{candidateStatus.label}</Badge>}
                            </div>
                            {attributes.areas && <p className="text-xs text-muted-foreground mt-0.5">{attributes.areas}</p>}
                            {candidate.summary && <p className="text-xs mt-1 line-clamp-3 whitespace-pre-wrap">{candidate.summary}</p>}
                            {candidate.error_message && candidate.status !== "sent" && (
                              <p className="text-xs text-destructive mt-0.5">{candidate.error_message}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {!candidates.length && (
                      <li className="p-3 text-sm text-muted-foreground">
                        {current.status === "collecting" ? "候補を集めています…" : "候補はいません"}
                      </li>
                    )}
                  </ul>
                  {current.status === "pending_approval" && (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={approve} disabled={busy !== null || selected.size === 0}>
                        {busy === "approve" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Send size={14} className="mr-1" />}
                        {selected.size}人に送る
                      </Button>
                      <Button variant="outline" onClick={cancel} disabled={busy !== null}>
                        <X size={14} className="mr-1" />今日は送らない
                      </Button>
                    </div>
                  )}
                  {["done", "failed"].includes(current.status) && (
                    <p className="text-sm">
                      送信 {current.sent_count}人
                      {current.failed_count ? ` / 送れなかった・確認できなかった ${current.failed_count}人` : ""}
                      {current.finished_at ? `（${formatTime(current.finished_at)}）` : ""}
                    </p>
                  )}
                </>
              )}
              {canCollect && (
                <Button variant={current ? "outline" : "default"} onClick={collectNow} disabled={busy !== null}>
                  {busy === "collect" ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserSearch size={14} className="mr-1" />}
                  今すぐ候補を集める
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">毎日の自動スカウト</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start justify-between gap-3">
                <span>
                  <span className="text-sm font-medium block">毎日、候補を集めて通知する</span>
                  <span className="text-xs text-muted-foreground">OKを押すまでは送りません</span>
                </span>
                <Switch checked={settings.enabled} onCheckedChange={(on) => updateSettings({ enabled: on })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="scout-count">1日に送る人数</Label>
                  <Input
                    id="scout-count"
                    type="number"
                    min={1}
                    max={30}
                    value={settings.daily_count}
                    onChange={(event) => updateSettings({ daily_count: Number(event.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="scout-time">候補を集める時刻</Label>
                  <Input
                    id="scout-time"
                    type="time"
                    value={settings.propose_at.slice(0, 5)}
                    onChange={(event) => updateSettings({ propose_at: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="scout-template">使うスカウトテンプレート</Label>
                <Input
                  id="scout-template"
                  placeholder="空欄ならエステ魂の1つ目のテンプレート"
                  value={settings.template_name ?? ""}
                  onChange={(event) => updateSettings({ template_name: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  文面はエステ魂の管理画面「スカウトテンプレート」で作ったものを使います（ここではテンプレート名だけ指定）
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="scout-areas">優先するエリア（カンマ区切り）</Label>
                <Input
                  id="scout-areas"
                  value={settings.preferred_areas.join(",")}
                  onChange={(event) => updateSettings({ preferred_areas: event.target.value.split(/[,、，]/) })}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={settings.only_preferred}
                    onCheckedChange={(on) => updateSettings({ only_preferred: on === true })}
                  />
                  このエリアの人だけ候補にする（外すと、足りない分は他の地域の人も入れます。出稼ぎ歓迎なら外したまま）
                </label>
              </div>
              <Button onClick={saveSettings} disabled={busy !== null || settingsSaved}>
                {busy === "save" && <Loader2 size={14} className="animate-spin mr-1" />}
                {settingsSaved ? "保存済み" : "設定を保存"}
              </Button>
            </CardContent>
          </Card>

          {batches.length > 1 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">これまでのスカウト</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {batches.slice(1).map((batch) => (
                    <li key={batch.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="w-16">{formatDate(batch.scout_date)}</span>
                      <Badge variant={SCOUT_BATCH_STATUS[batch.status]?.tone ?? "secondary"}>{SCOUT_BATCH_STATUS[batch.status]?.label ?? batch.status}</Badge>
                      <span className="text-muted-foreground">
                        候補 {batch.candidate_count}人 / 送信 {batch.sent_count}人{batch.failed_count ? ` / 失敗 ${batch.failed_count}人` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
