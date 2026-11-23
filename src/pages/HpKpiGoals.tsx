import { AdminPageShell } from "@/components/AdminPageShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import { CheckCircle2, ExternalLink, Loader2, Minus, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// KPI管理：KPIを自由に足す・直す・消す。KPIごとに 内容・頻度（毎日／毎週／毎月）・目標回数・メモ。
// 実施数はその期間（今日・今週（月曜はじまり）・今月）ごとに「＋」「−」で記録し、達成率を出す。
// 表は hp_kpi_items / hp_kpi_item_progress（20261123090000_free_kpi_items.sql）。

type KpiCadence = "daily" | "weekly" | "monthly";

type KpiItem = {
  id: string;
  title: string;
  cadence: KpiCadence;
  target_count: number;
  note: string | null;
  display_order: number;
};

type Draft = { title: string; cadence: KpiCadence; target: string; note: string };

const db = supabase as unknown as { from: (table: string) => any };

const CADENCES: Array<{ value: KpiCadence; label: string; group: string; badge: string; bar: string }> = [
  { value: "daily", label: "毎日", group: "日次KPI", badge: "border-sky-200 bg-sky-50 text-sky-700", bar: "bg-sky-500" },
  { value: "weekly", label: "毎週", group: "週次KPI", badge: "border-violet-200 bg-violet-50 text-violet-700", bar: "bg-violet-500" },
  { value: "monthly", label: "毎月", group: "月次KPI", badge: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500" },
];

const emptyDraft = (cadence: KpiCadence = "daily"): Draft => ({ title: "", cadence, target: "1", note: "" });

const periodOf = (cadence: KpiCadence, date = new Date()) => {
  if (cadence === "daily") return { start: format(date, "yyyy-MM-dd"), label: `今日 ${format(date, "M/d")}` };
  if (cadence === "weekly") {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return { start: format(start, "yyyy-MM-dd"), label: `今週 ${format(start, "M/d")}〜${format(addDays(start, 6), "M/d")}` };
  }
  return { start: format(startOfMonth(date), "yyyy-MM-dd"), label: `今月 ${format(date, "yyyy年M月")}` };
};

export default function HpKpiGoals({ embedded = false }: { embedded?: boolean } = {}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<KpiItem[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { user, loading: authLoading } = useAuth();
  const { storeId, store, loading: storeLoading } = useAdminStore();

  useEffect(() => {
    if (!authLoading && !user) window.location.assign("/login");
  }, [authLoading, user]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const [itemsRes, progressRes] = await Promise.all([
      db.from("hp_kpi_items").select("id,title,cadence,target_count,note,display_order")
        .eq("store_id", storeId).is("archived_at", null).order("display_order").order("created_at"),
      db.from("hp_kpi_item_progress").select("item_id,period_start,completed_count")
        .eq("store_id", storeId).gte("period_start", format(addDays(new Date(), -40), "yyyy-MM-dd")),
    ]);
    if (itemsRes.error || progressRes.error) toast.error("KPIを読み込めませんでした");
    const list = (itemsRes.data ?? []) as KpiItem[];
    const current: Record<string, number> = {};
    for (const item of list) {
      const start = periodOf(item.cadence).start;
      const row = (progressRes.data ?? []).find((p: { item_id: string; period_start: string }) => p.item_id === item.id && p.period_start === start);
      current[item.id] = row?.completed_count ?? 0;
    }
    setItems(list);
    setProgress(current);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (!storeLoading && user) void load();
  }, [storeLoading, user, load]);

  const startNew = (cadence: KpiCadence = "daily") => { setEditingId("new"); setDraft(emptyDraft(cadence)); };
  const startEdit = (item: KpiItem) => {
    setEditingId(item.id);
    setDraft({ title: item.title, cadence: item.cadence, target: String(item.target_count), note: item.note ?? "" });
  };

  const save = async () => {
    if (!storeId) return;
    const title = draft.title.trim();
    const target = Math.trunc(Number(draft.target));
    if (!title) { toast.error("KPIの内容を入力してください"); return; }
    if (title.length > 120) { toast.error("KPIの内容は120文字以内にしてください"); return; }
    if (!Number.isFinite(target) || target < 1 || target > 999) { toast.error("目標回数は1〜999回で入力してください"); return; }
    setSaving(true);
    const payload = { title, cadence: draft.cadence, target_count: target, note: draft.note.trim() || null, updated_at: new Date().toISOString() };
    const res = editingId === "new"
      ? await db.from("hp_kpi_items").insert({ ...payload, store_id: storeId, display_order: (items.at(-1)?.display_order ?? 0) + 10 })
      : await db.from("hp_kpi_items").update(payload).eq("id", editingId);
    setSaving(false);
    if (res.error) { toast.error("保存できませんでした"); return; }
    toast.success(editingId === "new" ? "KPIを追加しました" : "KPIを保存しました");
    setEditingId(null);
    void load();
  };

  const remove = async (item: KpiItem) => {
    if (!confirm(`「${item.title}」を消しますか？`)) return;
    const { error } = await db.from("hp_kpi_items").update({ archived_at: new Date().toISOString() }).eq("id", item.id);
    if (error) { toast.error("消せませんでした"); return; }
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    toast.success("消しました");
  };

  const changeCount = async (item: KpiItem, delta: number) => {
    if (!storeId) return;
    const next = Math.max(0, Math.min(999, (progress[item.id] ?? 0) + delta));
    setUpdatingId(item.id);
    const { error } = await db.from("hp_kpi_item_progress").upsert(
      { item_id: item.id, store_id: storeId, period_start: periodOf(item.cadence).start, completed_count: next, updated_at: new Date().toISOString() },
      { onConflict: "item_id,period_start" },
    );
    setUpdatingId(null);
    if (error) { toast.error("実施数を更新できませんでした"); return; }
    setProgress((prev) => ({ ...prev, [item.id]: next }));
    if (delta > 0 && next === item.target_count) toast.success(`「${item.title}」を達成しました`);
  };

  const grouped = useMemo(
    () => CADENCES.map((c) => ({ ...c, items: items.filter((i) => i.cadence === c.value) })),
    [items],
  );

  const form = (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-bold">{editingId === "new" ? "KPIを追加" : "KPIを編集"}</p>
        <div>
          <Label htmlFor="kpi-title">KPIの内容</Label>
          <Input id="kpi-title" className="mt-1" value={draft.title} maxLength={120} autoFocus
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="例：Xでのツイートまたはニュース更新" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>頻度</Label>
            <div className="mt-1 flex gap-1">
              {CADENCES.map((c) => (
                <Button key={c.value} type="button" size="sm" className="flex-1"
                  variant={draft.cadence === c.value ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, cadence: c.value }))}>
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="kpi-target">目標回数</Label>
            <Input id="kpi-target" className="mt-1" type="number" min="1" max="999" inputMode="numeric"
              value={draft.target} onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label htmlFor="kpi-note">メモ（任意）</Label>
          <Textarea id="kpi-note" className="mt-1" rows={2} maxLength={300} value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="なぜやるか・やり方など" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1 animate-spin" />}保存
          </Button>
          <Button variant="outline" onClick={() => setEditingId(null)}><X size={14} className="mr-1" />やめる</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AdminPageShell embedded={embedded} mainClassName="p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">KPI管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {store?.name ?? "店舗"}のKPIを自由に追加できます。作業を終えたら「＋」で実施数を記録してください。
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => startNew()} disabled={editingId !== null}><Plus size={16} className="mr-1" />KPIを追加</Button>
            <Button asChild variant="outline">
              <a href="/sales/monthly-target"><ExternalLink size={16} className="mr-2" />売上目標</a>
            </Button>
          </div>
        </header>

        {editingId === "new" && form}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.value} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">{group.group}<span className="ml-2 text-xs font-normal text-muted-foreground">{periodOf(group.value).label}</span></h2>
                  <Button size="sm" variant="ghost" onClick={() => startNew(group.value)} disabled={editingId !== null}>
                    <Plus size={14} className="mr-1" />追加
                  </Button>
                </div>
                {group.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">まだありません</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((item) => {
                      if (editingId === item.id) return <div key={item.id} className="md:col-span-2 lg:col-span-3">{form}</div>;
                      const done = progress[item.id] ?? 0;
                      const rate = Math.round((done / item.target_count) * 100);
                      const achieved = done >= item.target_count;
                      const busy = updatingId === item.id;
                      return (
                        <Card key={item.id} className={achieved ? "border-emerald-300" : undefined}>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <Badge variant="outline" className={group.badge}>{group.label}・目標{item.target_count}回</Badge>
                                <p className="mt-2 font-semibold leading-snug">{item.title}</p>
                                {item.note && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.note}</p>}
                              </div>
                              <div className="flex shrink-0 items-center">
                                {achieved && <CheckCircle2 className="mr-1 h-5 w-5 text-emerald-600" aria-label="達成" />}
                                <button onClick={() => startEdit(item)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="編集"><Pencil size={14} /></button>
                                <button onClick={() => void remove(item)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="消す"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            <div>
                              <div className="flex items-end justify-between">
                                <span className="text-3xl font-bold tabular-nums">{rate}%</span>
                                <span className="text-sm text-muted-foreground">実施 {done} / {item.target_count} 回</span>
                              </div>
                              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                                <div className={`h-full rounded-full ${achieved ? "bg-emerald-500" : group.bar}`} style={{ width: `${Math.min(100, rate)}%` }} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="icon" onClick={() => void changeCount(item, -1)} disabled={busy || done === 0} aria-label="実施数を減らす"><Minus size={16} /></Button>
                              <div className="flex h-9 flex-1 items-center justify-center rounded-md border text-sm font-semibold tabular-nums">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : `${done} 回`}
                              </div>
                              <Button size="icon" onClick={() => void changeCount(item, 1)} disabled={busy} aria-label="実施数を増やす"><Plus size={16} /></Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
            {items.length === 0 && (
              <Card><CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground"><Target size={18} />「KPIを追加」から、追いかけたいことを登録してください。</CardContent></Card>
            )}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
