import { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, ChevronDown, GraduationCap,
  CircleCheck, CircleDashed, CircleDot, Loader2, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { driveImgUrl } from "@/lib/drive";
import { format } from "date-fns";
import { MediaRegistrationMatrix } from "@/components/education/MediaRegistrationMatrix";
import O2Management from "@/pages/O2Management";
import { CurriculumManager } from "@/components/education/CurriculumManager";
import {
  type ChecklistItem,
  type ChecklistProgress,
  checkedIds,
  combinedProgress,
  moduleItems,
  moduleProgress,
  normalizeChecklist,
  statusFromProgress,
} from "@/lib/trainingChecklist";

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

interface Module {
  id: string;
  category: string;
  title: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  checklist: ChecklistItem[];
}

interface TrainingRecord {
  id?: string;
  cast_id: string;
  module_id: string;
  status: "not_started" | "in_progress" | "completed";
  implemented_date: string | null;
  instructor: string | null;
  score: number | null;
  feedback: string | null;
  improvement: string | null;
  checked_items: string[] | null;
}

type RecordLite = Pick<TrainingRecord, "status" | "checked_items">;

const STATUS_META: Record<string, { label: string; icon: any; color: string; badge: string }> = {
  not_started: { label: "未実施", icon: CircleDashed, color: "text-muted-foreground", badge: "bg-muted text-muted-foreground" },
  in_progress: { label: "受講中", icon: CircleDot, color: "text-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  completed: { label: "完了", icon: CircleCheck, color: "text-green-600", badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
};

const emptyRecord = (cast_id: string, module_id: string): TrainingRecord => ({
  cast_id, module_id, status: "not_started",
  implemented_date: null, instructor: null, score: null, feedback: null, improvement: null, checked_items: null,
});

export default function Education() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [records, setRecords] = useState<Record<string, TrainingRecord>>({}); // key: module_id (for selected cast)
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [castSort, setCastSort] = useState<"name" | "progressAsc" | "progressDesc">("name");
  const [moduleSort, setModuleSort] = useState<"category" | "status">("category");
  // 全セラピストの受講状況（一覧の進捗率ソート用）key: `${cast_id}:${module_id}`
  const [allRecords, setAllRecords] = useState<Record<string, RecordLite>>({});
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useAdminStore();
  const navigate = useNavigate();
  // タブはURL（?tab=）で開けるようにする（以前の「SNS連携管理」/marketing/o2 は ?tab=sns へ転送）
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ["status", "media", "sns", "curriculum"].includes(searchParams.get("tab") || "")
    ? searchParams.get("tab")!
    : "status";
  const changeTab = (value: string) => setSearchParams(value === "status" ? {} : { tab: value }, { replace: true });

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const fetchBase = useCallback(async () => {
    if (!user || storeLoading) return;
    setLoading(true);
    const [castsRes, modulesRes, recordsRes] = await Promise.all([
      supabase.from("casts").select("id,name,photo").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.from("training_modules" as any).select("*").eq("is_active", true).order("display_order"),
      supabase.from("cast_training_records" as any).select("cast_id, module_id, status, checked_items"),
    ]);
    const activeCasts = (castsRes.data || []) as Cast[];
    setCasts(activeCasts);
    setSelectedCast((current) => activeCasts.find((cast) => cast.id === current?.id) ?? null);
    setModules(((modulesRes.data || []) as any[]).map((m) => ({ ...m, checklist: normalizeChecklist(m.checklist) })) as Module[]);
    const recordMap: Record<string, RecordLite> = {};
    ((recordsRes.data || []) as any[]).forEach((r) => {
      recordMap[`${r.cast_id}:${r.module_id}`] = { status: r.status, checked_items: r.checked_items };
    });
    setAllRecords(recordMap);
    setLoading(false);
  }, [user, storeId, storeLoading]);

  useEffect(() => {
    void fetchBase();
    // 別画面でアーカイブしたセラピストも、画面に戻った時に一覧から除く。
    const refresh = () => { void fetchBase(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [fetchBase]);

  const selectCast = async (cast: Cast) => {
    setSelectedCast(cast);
    setExpandedModule(null);
    setRecordsLoading(true);
    const { data } = await supabase
      .from("cast_training_records" as any)
      .select("*")
      .eq("cast_id", cast.id);
    const map: Record<string, TrainingRecord> = {};
    (data || []).forEach((r: any) => { map[r.module_id] = r; });
    setRecords(map);
    setRecordsLoading(false);
  };

  const getRecord = (moduleId: string): TrainingRecord =>
    records[moduleId] ?? (selectedCast ? emptyRecord(selectedCast.id, moduleId) : emptyRecord("", moduleId));

  // チェックを付け外しするたびにすぐ保存する（状態はチェックの数から決める）
  const toggleItem = async (m: Module, itemId: string) => {
    if (!selectedCast) return;
    const castId = selectedCast.id;
    const before = getRecord(m.id);
    const ids = checkedIds(m.checklist, before);
    if (ids.has(itemId)) ids.delete(itemId);
    else ids.add(itemId);
    const checked = moduleItems(m.checklist).map((i) => i.id).filter((id) => ids.has(id));
    const status = statusFromProgress(moduleProgress(m.checklist, { checked_items: checked }));
    const implemented_date = before.implemented_date
      ?? (status === "completed" ? format(new Date(), "yyyy-MM-dd") : null);
    const next = { ...before, checked_items: checked, status, implemented_date };
    setRecords((prev) => ({ ...prev, [m.id]: next }));
    setAllRecords((prev) => ({ ...prev, [`${castId}:${m.id}`]: { status, checked_items: checked } }));

    setSavingModule(m.id);
    const { error } = await supabase
      .from("cast_training_records" as any)
      .upsert({
        cast_id: castId,
        module_id: m.id,
        status,
        checked_items: checked,
        implemented_date,
        updated_at: new Date().toISOString(),
      }, { onConflict: "cast_id,module_id" });
    setSavingModule(null);
    if (error) {
      toast.error("保存に失敗しました");
      setRecords((prev) => ({ ...prev, [m.id]: before }));
      setAllRecords((prev) => ({ ...prev, [`${castId}:${m.id}`]: { status: before.status, checked_items: before.checked_items } }));
    }
  };

  // セラピストごとの進み具合（チェックした項目の％。一覧ソート・表示用）
  const castProgress = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of casts) {
      map[c.id] = combinedProgress(modules.map((m) => moduleProgress(m.checklist, allRecords[`${c.id}:${m.id}`]))).pct;
    }
    return map;
  }, [casts, modules, allRecords]);

  // 選んだセラピストの講習ごとの進み具合
  const moduleProgressMap = useMemo(() => {
    const map: Record<string, ChecklistProgress> = {};
    for (const m of modules) map[m.id] = moduleProgress(m.checklist, records[m.id]);
    return map;
  }, [modules, records]);
  const moduleStatus = (m: Module) => statusFromProgress(moduleProgressMap[m.id] ?? { done: 0, total: 1, pct: 0 });

  const filtered = useMemo(() => {
    const list = casts.filter((c) => c.name.includes(searchQuery));
    if (castSort === "progressAsc") {
      return [...list].sort((a, b) => (castProgress[a.id] ?? 0) - (castProgress[b.id] ?? 0));
    }
    if (castSort === "progressDesc") {
      return [...list].sort((a, b) => (castProgress[b.id] ?? 0) - (castProgress[a.id] ?? 0));
    }
    return list;
  }, [casts, searchQuery, castSort, castProgress]);

  // grouped modules by category
  const grouped = useMemo(() => {
    const g: Record<string, Module[]> = {};
    for (const m of modules) {
      (g[m.category] ??= []).push(m);
    }
    return g;
  }, [modules]);

  // 受講状況タブの項目グルーピング（カテゴリ別 or 受講状況別）
  const moduleGroups = useMemo(() => {
    if (moduleSort === "category") {
      return Object.entries(grouped).map(([label, mods]) => ({ label, mods }));
    }
    const order: TrainingRecord["status"][] = ["not_started", "in_progress", "completed"];
    return order
      .map((st) => ({
        label: STATUS_META[st].label,
        mods: modules.filter((m) => statusFromProgress(moduleProgressMap[m.id]) === st),
      }))
      .filter((g) => g.mods.length > 0);
  }, [moduleSort, grouped, modules, moduleProgressMap]);

  // progress for selected cast
  const progress = useMemo(() => {
    const total = modules.length;
    let completed = 0, inProgress = 0;
    for (const m of modules) {
      const st = statusFromProgress(moduleProgressMap[m.id]);
      if (st === "completed") completed++;
      else if (st === "in_progress") inProgress++;
    }
    const notStarted = total - completed - inProgress;
    const pct = combinedProgress(modules.map((m) => moduleProgressMap[m.id])).pct;
    return { total, completed, inProgress, notStarted, pct };
  }, [modules, moduleProgressMap]);

  const notTaught = modules.filter((m) => moduleStatus(m) === "not_started");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center gap-2">
            <GraduationCap className="text-primary" size={24} />
            <div>
              <h1 className="text-2xl font-bold">教育・媒体登録</h1>
              <p className="text-muted-foreground text-sm">講習状況と、エステ魂・O2・Xの登録状況・SNS連携をまとめて管理</p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList className="mb-4 h-auto flex-wrap justify-start">
              <TabsTrigger value="status">受講状況</TabsTrigger>
              <TabsTrigger value="media">媒体登録状況</TabsTrigger>
              <TabsTrigger value="sns">SNS連携・ログイン情報</TabsTrigger>
              <TabsTrigger value="curriculum">カリキュラム管理</TabsTrigger>
            </TabsList>

            {/* ── 媒体登録状況（エステ魂・O2・X） ── */}
            <TabsContent value="media">
              <MediaRegistrationMatrix onOpenSns={() => changeTab("sns")} />
            </TabsContent>

            {/* ── SNS連携・ログイン情報（O2・X・魂セラピスト） ── */}
            <TabsContent value="sns">
              <O2Management />
            </TabsContent>

            {/* ── 受講状況 ── */}
            <TabsContent value="status">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: cast list */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Search size={16} className="text-muted-foreground" />
                    <Input placeholder="名前で検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                  <div className="flex gap-1.5 mb-3">
                    {([
                      { key: "name", label: "名前順" },
                      { key: "progressAsc", label: "進捗が低い順" },
                      { key: "progressDesc", label: "進捗が高い順" },
                    ] as const).map((s) => (
                      <button key={s.key} onClick={() => setCastSort(s.key)}
                        className={`text-xs px-2 py-1 rounded-full border transition-colors ${castSort === s.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {loading ? (
                    <div className="text-center text-muted-foreground py-4 text-sm">読み込み中...</div>
                  ) : (
                    <div className="space-y-1">
                      {filtered.map((c) => {
                        const pct = castProgress[c.id] ?? 0;
                        const selected = selectedCast?.id === c.id;
                        return (
                          <button key={c.id} onClick={() => selectCast(c)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${selected ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                            {c.photo && (
                              <img src={driveImgUrl(c.photo, 100)} className="w-8 h-8 rounded object-cover object-top shrink-0" />
                            )}
                            <span className="truncate flex-1">{c.name}</span>
                            <span className={`text-xs tabular-nums shrink-0 ${selected ? "text-primary-foreground/80" : pct >= 100 ? "text-green-600" : pct > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                              {pct}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: training dashboard */}
                <div className="lg:col-span-2">
                  {!selectedCast ? (
                    <Card>
                      <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                        左からセラピストを選択してください
                      </CardContent>
                    </Card>
                  ) : recordsLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                  ) : (
                    <div className="space-y-5">
                      {/* Progress summary */}
                      <Card>
                        <CardContent className="pt-5">
                          <div className="flex items-center gap-3 mb-3">
                            {selectedCast.photo && (
                              <img src={driveImgUrl(selectedCast.photo, 200)} className="w-12 h-12 rounded object-cover object-top" />
                            )}
                            <div className="flex-1">
                              <p className="font-bold text-lg">{selectedCast.name}</p>
                              <p className="text-xs text-muted-foreground">
                                講習進捗 {progress.completed} / {progress.total} 項目完了
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold text-primary tabular-nums">{progress.pct}<span className="text-base">%</span></p>
                            </div>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
                          </div>
                          <div className="flex gap-4 mt-3 text-xs">
                            <span className="flex items-center gap-1 text-green-600"><CircleCheck size={13} />完了 {progress.completed}</span>
                            <span className="flex items-center gap-1 text-amber-500"><CircleDot size={13} />受講中 {progress.inProgress}</span>
                            <span className="flex items-center gap-1 text-muted-foreground"><CircleDashed size={13} />未実施 {progress.notStarted}</span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* まだ教えていない項目 */}
                      {notTaught.length > 0 && (
                        <Card className="border-amber-300 dark:border-amber-800">
                          <CardContent className="pt-4">
                            <p className="font-semibold text-sm flex items-center gap-1.5 mb-2 text-amber-600">
                              <CircleDashed size={15} />まだ教えていない項目（{notTaught.length}）
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {notTaught.map((m) => (
                                <button key={m.id}
                                  onClick={() => { setExpandedModule(m.id); document.getElementById(`mod-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                                  className="text-xs px-2 py-1 rounded-full border border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                                  {m.title}
                                </button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* 表示順切り替え */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground mr-1">表示順：</span>
                        {([
                          { key: "category", label: "カテゴリ別" },
                          { key: "status", label: "受講状況別" },
                        ] as const).map((s) => (
                          <button key={s.key} onClick={() => setModuleSort(s.key)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${moduleSort === s.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
                            {s.label}
                          </button>
                        ))}
                      </div>

                      {/* Curriculum grouped by category or status */}
                      {moduleGroups.map(({ label, mods }) => {
                        const group = combinedProgress(mods.map((m) => moduleProgressMap[m.id]));
                        return (
                        <div key={label}>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <BookOpen size={13} />{label}
                            </p>
                            <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary transition-all" style={{ width: `${group.pct}%` }} />
                            </div>
                            <span className={`text-xs font-semibold tabular-nums ${group.pct >= 100 ? "text-green-600" : group.pct > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                              {group.pct}%
                            </span>
                          </div>
                          <div className="space-y-2">
                            {mods.map((m) => {
                              const rec = getRecord(m.id);
                              const mp = moduleProgressMap[m.id];
                              const meta = STATUS_META[statusFromProgress(mp)];
                              const StatusIcon = meta.icon;
                              const isExpanded = expandedModule === m.id;
                              const checked = checkedIds(m.checklist, rec);
                              return (
                                <div key={m.id} id={`mod-${m.id}`} className="rounded-xl border bg-card overflow-hidden">
                                  <button
                                    onClick={() => setExpandedModule(isExpanded ? null : m.id)}
                                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                                  >
                                    <StatusIcon size={18} className={meta.color} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium">{m.title}</p>
                                      {rec.implemented_date && (
                                        <p className="text-xs text-muted-foreground">実施日：{rec.implemented_date}</p>
                                      )}
                                    </div>
                                    {savingModule === m.id && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums ${meta.badge}`}>
                                      {mp.total > 1 ? `${mp.done}/${mp.total}・` : ""}{mp.pct}%
                                    </span>
                                    <ChevronDown size={15} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>

                                  {isExpanded && (
                                    <div className="px-4 pb-3 pt-1 border-t bg-muted/10">
                                      {m.description && (
                                        <p className="text-xs text-muted-foreground pt-2 pb-1">{m.description}</p>
                                      )}
                                      <div className="divide-y">
                                        {moduleItems(m.checklist).map((item) => (
                                          <label key={item.id} className="flex items-center gap-3 py-2.5 cursor-pointer select-none">
                                            <Checkbox
                                              className="h-5 w-5"
                                              checked={checked.has(item.id)}
                                              onCheckedChange={() => void toggleItem(m, item.id)}
                                            />
                                            <span className={`text-sm ${checked.has(item.id) ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                      {m.checklist.length === 0 && (
                                        <p className="text-[11px] text-muted-foreground">チェック項目は「カリキュラム管理」で足せます</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── カリキュラム管理 ── */}
            <TabsContent value="curriculum">
              <CurriculumManager modules={modules} setModules={setModules} onReload={fetchBase} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
