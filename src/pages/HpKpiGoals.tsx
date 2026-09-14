import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Save,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type KpiCadence = "daily" | "weekly" | "monthly";

type KpiGoalDraft = {
  title: string;
  targetCount: number;
};

type KpiProgress = Record<KpiCadence, number>;

type KpiPeriod = {
  start: string;
  label: string;
};

type KpiDefinition = {
  cadence: KpiCadence;
  label: string;
  frequency: string;
  defaultTitle: string;
  guidance: string;
  icon: LucideIcon;
  badgeClassName: string;
  progressClassName: string;
};

const KPI_DEFINITIONS: KpiDefinition[] = [
  {
    cadence: "daily",
    label: "日次KPI",
    frequency: "1日1回・簡単",
    defaultTitle: "Xでのツイートまたはニュース更新",
    guidance: "公開情報を毎日ひとつ更新し、HPへの流入と鮮度を保ちます。",
    icon: CalendarDays,
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    progressClassName: "bg-sky-500",
  },
  {
    cadence: "weekly",
    label: "週次KPI",
    frequency: "週1回・中難易度",
    defaultTitle: "トップバナーを入れ替え、週ごとのキャンペーンを設定",
    guidance: "訴求を週ごとに更新し、再訪ユーザーに新しい理由をつくります。",
    icon: CalendarRange,
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
    progressClassName: "bg-violet-500",
  },
  {
    cadence: "monthly",
    label: "月次KPI",
    frequency: "月1回・重点作業",
    defaultTitle: "HPの導線を見直して変更",
    guidance: "予約までの導線を見直し、改善を一つ以上反映します。",
    icon: Target,
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    progressClassName: "bg-amber-500",
  },
];

const CADENCES: KpiCadence[] = ["daily", "weekly", "monthly"];

const defaultGoalDrafts = (): Record<KpiCadence, KpiGoalDraft> => ({
  daily: { title: KPI_DEFINITIONS[0].defaultTitle, targetCount: 1 },
  weekly: { title: KPI_DEFINITIONS[1].defaultTitle, targetCount: 1 },
  monthly: { title: KPI_DEFINITIONS[2].defaultTitle, targetCount: 1 },
});

const currentPeriods = (date = new Date()): Record<KpiCadence, KpiPeriod> => {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  return {
    daily: {
      start: format(date, "yyyy-MM-dd"),
      label: `今日 ${format(date, "M/d")}`,
    },
    weekly: {
      start: format(weekStart, "yyyy-MM-dd"),
      label: `今週 ${format(weekStart, "M/d")}〜${format(weekEnd, "M/d")}`,
    },
    monthly: {
      start: format(startOfMonth(date), "yyyy-MM-dd"),
      label: `今月 ${format(date, "yyyy年M月")}`,
    },
  };
};

const clampCount = (value: number, minimum: number, maximum = 999) =>
  Math.min(maximum, Math.max(minimum, Math.trunc(Number.isFinite(value) ? value : minimum)));

export default function HpKpiGoals() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingCadence, setSavingCadence] = useState<KpiCadence | null>(null);
  const [updatingCadence, setUpdatingCadence] = useState<KpiCadence | null>(null);
  const [goalDrafts, setGoalDrafts] = useState<Record<KpiCadence, KpiGoalDraft>>(defaultGoalDrafts);
  const [progress, setProgress] = useState<KpiProgress>({ daily: 0, weekly: 0, monthly: 0 });

  const { user, loading: authLoading } = useAuth();
  const { storeId, store, loading: storeLoading } = useAdminStore();
  const periods = useMemo(() => currentPeriods(), []);

  useEffect(() => {
    if (!authLoading && !user) window.location.assign("/login");
  }, [authLoading, user]);

  const loadKpis = useCallback(async () => {
    setLoading(true);
    try {
      const periodStarts = CADENCES.map((cadence) => periods[cadence].start);
      const [goalsResult, progressResult] = await Promise.all([
        supabase
          .from("hp_kpi_goals")
          .select("cadence,title,target_count")
          .eq("store_id", storeId),
        supabase
          .from("hp_kpi_progress")
          .select("cadence,period_start,completed_count")
          .eq("store_id", storeId)
          .in("cadence", CADENCES)
          .in("period_start", periodStarts),
      ]);

      if (goalsResult.error) throw goalsResult.error;
      if (progressResult.error) throw progressResult.error;

      const nextGoals = defaultGoalDrafts();
      for (const goal of goalsResult.data || []) {
        if (CADENCES.includes(goal.cadence as KpiCadence)) {
          const cadence = goal.cadence as KpiCadence;
          nextGoals[cadence] = {
            title: goal.title,
            targetCount: goal.target_count,
          };
        }
      }
      setGoalDrafts(nextGoals);

      const nextProgress: KpiProgress = { daily: 0, weekly: 0, monthly: 0 };
      for (const row of progressResult.data || []) {
        if (CADENCES.includes(row.cadence as KpiCadence) && row.period_start === periods[row.cadence as KpiCadence].start) {
          nextProgress[row.cadence as KpiCadence] = row.completed_count;
        }
      }
      setProgress(nextProgress);
    } catch (error) {
      console.error("Error loading HP KPIs:", error);
      toast.error("HP KPIの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [periods, storeId]);

  useEffect(() => {
    if (!user || storeLoading) return;
    void loadKpis();
  }, [loadKpis, storeLoading, user]);

  const updateGoalDraft = (cadence: KpiCadence, update: Partial<KpiGoalDraft>) => {
    setGoalDrafts((current) => ({
      ...current,
      [cadence]: { ...current[cadence], ...update },
    }));
  };

  const validateDraft = (cadence: KpiCadence) => {
    const draft = goalDrafts[cadence];
    const title = draft.title.trim();
    const targetCount = Math.trunc(draft.targetCount);

    if (!title) {
      toast.error("KPIの内容を入力してください");
      return null;
    }
    if (title.length > 120) {
      toast.error("KPIの内容は120文字以内で入力してください");
      return null;
    }
    if (!Number.isFinite(targetCount) || targetCount < 1 || targetCount > 999) {
      toast.error("目標回数は1〜999回で入力してください");
      return null;
    }

    return { title, targetCount };
  };

  const saveGoal = async (cadence: KpiCadence, successMessage = "KPI設定を保存しました") => {
    const draft = validateDraft(cadence);
    if (!draft) return false;

    setSavingCadence(cadence);
    try {
      const { error } = await supabase
        .from("hp_kpi_goals")
        .upsert(
          {
            store_id: storeId,
            cadence,
            title: draft.title,
            target_count: draft.targetCount,
          },
          { onConflict: "store_id,cadence" },
        );
      if (error) throw error;

      updateGoalDraft(cadence, draft);
      toast.success(successMessage);
      return true;
    } catch (error) {
      console.error("Error saving HP KPI:", error);
      toast.error("KPI設定の保存に失敗しました");
      return false;
    } finally {
      setSavingCadence(null);
    }
  };

  const setCompletedCount = async (cadence: KpiCadence, requestedCount: number) => {
    const draft = validateDraft(cadence);
    if (!draft) return;

    const completedCount = clampCount(requestedCount, 0);
    setUpdatingCadence(cadence);
    try {
      const { error: goalError } = await supabase
        .from("hp_kpi_goals")
        .upsert(
          {
            store_id: storeId,
            cadence,
            title: draft.title,
            target_count: draft.targetCount,
          },
          { onConflict: "store_id,cadence" },
        );
      if (goalError) throw goalError;

      const { error: progressError } = await supabase
        .from("hp_kpi_progress")
        .upsert(
          {
            store_id: storeId,
            cadence,
            period_start: periods[cadence].start,
            completed_count: completedCount,
          },
          { onConflict: "store_id,cadence,period_start" },
        );
      if (progressError) throw progressError;

      updateGoalDraft(cadence, draft);
      setProgress((current) => ({ ...current, [cadence]: completedCount }));
      const achieved = completedCount >= draft.targetCount;
      toast.success(achieved ? `${KPI_DEFINITIONS.find((item) => item.cadence === cadence)?.label}を達成しました` : "実施数を更新しました");
    } catch (error) {
      console.error("Error updating HP KPI progress:", error);
      toast.error("実施数の更新に失敗しました");
    } finally {
      setUpdatingCadence(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">HP 売上目標・KPI</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {store?.name ?? "店舗"}の売上目標に向けた日次・週次・月次の改善施策を管理します。
              </p>
            </div>
            <Button asChild variant="outline">
              <a href="/sales/monthly-target">
                <ExternalLink size={16} className="mr-2" /> 売上目標を開く
              </a>
            </Button>
          </header>

          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
              <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>
                それぞれのKPIは、目標回数と対象期間内の実施回数から自動で達成率を計算します。目標回数を1回以上に設定し、作業を終えたら「＋」で実施数を記録してください。
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              {KPI_DEFINITIONS.map((definition) => {
                const Icon = definition.icon;
                const draft = goalDrafts[definition.cadence];
                const completed = progress[definition.cadence];
                const achievement = draft.targetCount > 0 ? (completed / draft.targetCount) * 100 : 0;
                const progressWidth = Math.min(100, achievement);
                const isSaving = savingCadence === definition.cadence;
                const isUpdating = updatingCadence === definition.cadence;
                const isAchieved = achievement >= 100;

                return (
                  <Card key={definition.cadence} className={isAchieved ? "border-emerald-300" : undefined}>
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg bg-muted p-2"><Icon className="h-5 w-5" /></div>
                          <div>
                            <CardTitle className="text-lg">{definition.label}</CardTitle>
                            <CardDescription className="mt-0.5">{definition.frequency}</CardDescription>
                          </div>
                        </div>
                        {isAchieved && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="達成" />}
                      </div>
                      <Badge variant="outline" className={`w-fit ${definition.badgeClassName}`}>{periods[definition.cadence].label}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div>
                        <div className="flex items-end justify-between gap-3">
                          <p className={`text-4xl font-bold tabular-nums ${isAchieved ? "text-emerald-600" : "text-foreground"}`}>{achievement.toFixed(0)}%</p>
                          <p className="pb-1 text-sm text-muted-foreground">実施 {completed} / {draft.targetCount} 回</p>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" aria-label={`${definition.label} 達成率 ${achievement.toFixed(0)}%`}>
                          <div className={`h-full rounded-full transition-all ${definition.progressClassName}`} style={{ width: `${progressWidth}%` }} />
                        </div>
                      </div>

                      <p className="min-h-10 text-sm text-muted-foreground">{definition.guidance}</p>

                      <div className="space-y-2">
                        <Label htmlFor={`${definition.cadence}-kpi-title`}>KPIの内容</Label>
                        <Input
                          id={`${definition.cadence}-kpi-title`}
                          value={draft.title}
                          maxLength={120}
                          onChange={(event) => updateGoalDraft(definition.cadence, { title: event.target.value })}
                          placeholder={definition.defaultTitle}
                        />
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`${definition.cadence}-target-count`}>目標回数</Label>
                          <Input
                            id={`${definition.cadence}-target-count`}
                            className="mt-2"
                            type="number"
                            min="1"
                            max="999"
                            inputMode="numeric"
                            value={draft.targetCount || ""}
                            onChange={(event) => updateGoalDraft(definition.cadence, {
                              targetCount: event.target.value === "" ? 0 : Number(event.target.value),
                            })}
                          />
                        </div>
                        <Button type="button" variant="outline" onClick={() => void saveGoal(definition.cadence)} disabled={isSaving || isUpdating}>
                          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          <span className="sr-only">{definition.label}を保存</span>
                        </Button>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <Label className="mb-2 block text-xs text-muted-foreground">対象期間の実施数</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`${definition.label}の実施数を減らす`}
                            onClick={() => void setCompletedCount(definition.cadence, completed - 1)}
                            disabled={isUpdating || completed === 0}
                          >
                            <ChevronDown size={16} />
                          </Button>
                          <div className="flex h-9 flex-1 items-center justify-center rounded-md border bg-background text-sm font-semibold tabular-nums" aria-label={`${definition.label}の実施数`}>
                            {completed} 回
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            aria-label={`${definition.label}の実施数を増やす`}
                            onClick={() => void setCompletedCount(definition.cadence, completed + 1)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <ChevronUp size={16} />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
