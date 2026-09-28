import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_X_OPERATIONS_PLAN,
  X_OPS_CONTENT_KEY,
  buildCombinedTimeline,
  buildXOperationsCsv,
  normalizeXOperationsPlan,
  type XAccountPlan,
  type XOperationsPlan,
} from "@/lib/xOperationsPlan";

/* ---------------- スプレッドシート風の編集テーブル ---------------- */

interface Column<T> {
  key: keyof T & string;
  label: string;
  width: string;
}

function SheetTable<T extends Record<string, string>>({
  columns,
  rows,
  onChange,
  emptyRow,
  highlight,
}: {
  columns: Column<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  emptyRow: T;
  highlight?: (row: T) => boolean;
}) {
  const update = (i: number, key: keyof T, v: string) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60">
            <th className="w-8 border-b border-r px-1 py-2 text-xs text-muted-foreground">#</th>
            {columns.map((c) => (
              <th key={c.key} className={cn("border-b border-r px-2 py-2 text-left text-xs font-semibold", c.width)}>
                {c.label}
              </th>
            ))}
            <th className="w-9 border-b" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn("align-top", highlight?.(r) && "bg-amber-500/10")}>
              <td className="border-b border-r px-1 py-1 text-center text-xs text-muted-foreground">{i + 1}</td>
              {columns.map((c) => (
                <td key={c.key} className="border-b border-r p-0">
                  <textarea
                    value={r[c.key] ?? ""}
                    onChange={(e) => update(i, c.key, e.target.value)}
                    rows={Math.max(1, (r[c.key] ?? "").split("\n").length)}
                    className="block w-full resize-none bg-transparent px-2 py-1.5 leading-snug outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary"
                  />
                </td>
              ))}
              <td className="border-b px-1 py-1 text-center">
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="行を削除"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => onChange([...rows, { ...emptyRow }])}
        className="flex w-full items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
      >
        <Plus size={14} /> 行を追加
      </button>
    </div>
  );
}

/* ---------------- 定数 ---------------- */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const ACCOUNT_COLORS: Record<string, string> = {
  shukyaku: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  kyujin: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  tencho: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

const dailyColumns: Column<XAccountPlan["daily"][number]>[] = [
  { key: "time", label: "時間", width: "w-20" },
  { key: "type", label: "投稿タイプ", width: "w-32" },
  { key: "content", label: "内容", width: "w-56" },
  { key: "example", label: "例文", width: "min-w-[260px]" },
  { key: "material", label: "素材", width: "w-40" },
  { key: "goal", label: "目的", width: "w-28" },
];

const weeklyColumns: Column<XAccountPlan["weekly"][number]>[] = [
  { key: "day", label: "曜日", width: "w-14" },
  { key: "theme", label: "テーマ", width: "w-48" },
  { key: "detail", label: "内容", width: "" },
];

const routineColumns: Column<XAccountPlan["routines"][number]>[] = [
  { key: "timing", label: "タイミング", width: "w-24" },
  { key: "task", label: "やること", width: "w-72" },
  { key: "note", label: "メモ", width: "" },
];

/* ---------------- ページ本体 ---------------- */

export default function HpXOperations() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plan, setPlan] = useState<XOperationsPlan>(DEFAULT_X_OPERATIONS_PLAN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const { store, loading: storeLoading } = useAdminStore();
  const navigate = useNavigate();
  const today = WEEKDAYS[new Date().getDay()];

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user || storeLoading || !store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("site_content")
        .select("value")
        .eq("key", X_OPS_CONTENT_KEY)
        .eq("store_id", store.id)
        .maybeSingle();
      if (data?.value) {
        try {
          setPlan(normalizeXOperationsPlan(JSON.parse(data.value)));
        } catch {
          setPlan(DEFAULT_X_OPERATIONS_PLAN);
        }
      }
      setLoading(false);
    })();
  }, [user, store, storeLoading]);

  const combined = useMemo(() => buildCombinedTimeline(plan), [plan]);

  const change = (next: XOperationsPlan) => {
    setPlan(next);
    setDirty(true);
  };

  const updateAccount = (key: string, patch: Partial<XAccountPlan>) =>
    change({ ...plan, accounts: plan.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)) });

  const handleSave = async () => {
    if (!store) return;
    setSaving(true);
    const { error } = await supabase.from("site_content").upsert(
      [{ store_id: store.id, key: X_OPS_CONTENT_KEY, value: JSON.stringify(plan), updated_at: new Date().toISOString() }],
      { onConflict: "store_id,key" },
    );
    setSaving(false);
    if (error) {
      toast.error(`保存に失敗しました: ${error.message}`);
      return;
    }
    setDirty(false);
    toast.success("保存しました");
  };

  const handleReset = () => {
    if (!confirm("初期テンプレートに戻しますか？（保存するまで反映されません）")) return;
    change(DEFAULT_X_OPERATIONS_PLAN);
  };

  const handleDownload = () => {
    const blob = new Blob([buildXOperationsCsv(plan)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "X運用表.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">HP</p>
              <h1 className="text-2xl font-bold">X運用表</h1>
              <p className="text-sm text-muted-foreground">
                集客・求人・店長の3アカウントで「毎日いつ・何を投稿するか」をまとめた運用表です。セルをクリックすると直接編集できます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} className="mr-1" />初期テンプレート
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download size={14} className="mr-1" />Excel用CSV
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || loading || !dirty}>
                <Save size={14} className="mr-1" />
                {saving ? "保存中..." : dirty ? "保存" : "保存済み"}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">読み込み中...</div>
          ) : (
            <Tabs defaultValue="all">
              <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
                <TabsTrigger value="all">1日の全体タイムライン</TabsTrigger>
                {plan.accounts.map((a) => (
                  <TabsTrigger key={a.key} value={a.key}>{a.name}</TabsTrigger>
                ))}
                <TabsTrigger value="rules">運用ルール</TabsTrigger>
              </TabsList>

              {/* 全体タイムライン */}
              <TabsContent value="all" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {plan.accounts.map((a) => {
                    const todayTheme = a.weekly.find((w) => w.day === today);
                    return (
                      <div key={a.key} className="rounded-lg border p-4">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", ACCOUNT_COLORS[a.key] ?? "bg-muted")}>
                          {a.name}
                        </span>
                        <p className="mt-2 text-sm">{a.purpose}</p>
                        <p className="mt-2 text-xs text-muted-foreground">1日 {a.daily.length}投稿</p>
                        {todayTheme && (
                          <p className="mt-2 rounded bg-muted/50 px-2 py-1 text-xs">
                            今日（{today}）のテーマ：<span className="font-semibold">{todayTheme.theme}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/60 text-left text-xs">
                        <th className="w-16 border-b border-r px-2 py-2">時間</th>
                        <th className="w-32 border-b border-r px-2 py-2">アカウント</th>
                        <th className="w-32 border-b border-r px-2 py-2">投稿タイプ</th>
                        <th className="border-b border-r px-2 py-2">内容</th>
                        <th className="w-28 border-b px-2 py-2">目的</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combined.map((r, i) => (
                        <tr key={i} className="align-top">
                          <td className="border-b border-r px-2 py-1.5 font-mono">{r.time}</td>
                          <td className="border-b border-r px-2 py-1.5">
                            <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", ACCOUNT_COLORS[r.accountKey] ?? "bg-muted")}>
                              {r.account}
                            </span>
                          </td>
                          <td className="border-b border-r px-2 py-1.5 font-medium">{r.type}</td>
                          <td className="border-b border-r px-2 py-1.5">{r.content}</td>
                          <td className="border-b px-2 py-1.5 text-muted-foreground">{r.goal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">※ 各アカウントのタブで編集すると、ここに時間順で反映されます。</p>
              </TabsContent>

              {/* アカウント別 */}
              {plan.accounts.map((a) => (
                <TabsContent key={a.key} value={a.key} className="space-y-6">
                  <section className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                    {([
                      ["handle", "アカウント（@ID）", "@xxxxx"],
                      ["purpose", "目的", ""],
                      ["kpi", "KPI", ""],
                      ["target", "ターゲット", ""],
                      ["tone", "トーン・口調", ""],
                    ] as const).map(([k, label, ph]) => (
                      <label key={k} className="block text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <Input
                          className="mt-1"
                          placeholder={ph}
                          value={a[k]}
                          onChange={(e) => updateAccount(a.key, { [k]: e.target.value })}
                        />
                      </label>
                    ))}
                  </section>

                  <section>
                    <h2 className="mb-2 text-base font-semibold">1日の投稿スケジュール</h2>
                    <SheetTable
                      columns={dailyColumns}
                      rows={a.daily}
                      onChange={(rows) => updateAccount(a.key, { daily: rows })}
                      emptyRow={{ time: "", type: "", content: "", example: "", material: "", goal: "" }}
                    />
                  </section>

                  <section>
                    <h2 className="mb-2 text-base font-semibold">曜日別テーマ</h2>
                    <SheetTable
                      columns={weeklyColumns}
                      rows={a.weekly}
                      onChange={(rows) => updateAccount(a.key, { weekly: rows })}
                      emptyRow={{ day: "", theme: "", detail: "" }}
                      highlight={(r) => r.day === today}
                    />
                  </section>

                  <section>
                    <h2 className="mb-2 text-base font-semibold">毎日のルーティン</h2>
                    <SheetTable
                      columns={routineColumns}
                      rows={a.routines}
                      onChange={(rows) => updateAccount(a.key, { routines: rows })}
                      emptyRow={{ timing: "", task: "", note: "" }}
                    />
                  </section>
                </TabsContent>
              ))}

              {/* 運用ルール */}
              <TabsContent value="rules">
                <div className="space-y-2 rounded-lg border p-4">
                  {plan.rules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
                      <Input
                        value={rule}
                        onChange={(e) => change({ ...plan, rules: plan.rules.map((r, idx) => (idx === i ? e.target.value : r)) })}
                      />
                      <button
                        type="button"
                        onClick={() => change({ ...plan, rules: plan.rules.filter((_, idx) => idx !== i) })}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label="ルールを削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => change({ ...plan, rules: [...plan.rules, ""] })}>
                    <Plus size={14} className="mr-1" />ルールを追加
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}
