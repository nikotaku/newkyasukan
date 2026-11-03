import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  completeTherapistPromotionTask,
  useTherapistPromotion,
} from "@/hooks/useTherapistPromotion";
import {
  groupPromotionPostings,
  isTherapistPromotionTask,
  promotionDate,
  promotionPostingProgress,
  promotionReportedAt,
  therapistOnlyPromotionPlans,
  type TherapistPromotionTask,
} from "@/lib/therapistPromotion";

export function TherapistPromotionSummary({
  token,
  onOpen,
}: {
  token: string;
  onOpen: () => void;
}) {
  const { data: allPlans = [] } = useTherapistPromotion(token);
  const plans = therapistOnlyPromotionPlans(allPlans);
  if (!plans.length) return null;
  const progress = promotionPostingProgress(plans);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-left"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Megaphone size={17} className="text-primary" />
        投稿宣伝スケジュール
        <ChevronRight size={16} className="ml-auto" />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        あなたが投稿する予定です。投稿したらチェックしてください。
      </p>
      <p className="mt-2 text-sm font-semibold text-primary">
        投稿報告 {progress.completed}/{progress.total}件 完了
      </p>
    </button>
  );
}

export function TherapistPromotionSchedule({ token }: { token: string }) {
  const {
    data: allPlans = [],
    isPending,
    error,
    refetch,
    isFetching,
  } = useTherapistPromotion(token);
  const plans = therapistOnlyPromotionPlans(allPlans);
  const queryClient = useQueryClient();
  const busyIds = useRef(new Set<string>());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const report = async (task: TherapistPromotionTask, completed: boolean) => {
    if (!isTherapistPromotionTask(task)) return;
    if (busyIds.current.has(task.id)) return;
    busyIds.current.add(task.id);
    setSavingIds(new Set(busyIds.current));
    try {
      const saved = await completeTherapistPromotionTask(
        token,
        task.id,
        completed,
      );
      if (saved !== completed)
        throw new Error(
          "投稿報告を保存できませんでした。再読み込みしてお試しください",
        );
      await queryClient.invalidateQueries({
        queryKey: ["therapist-promotion", token],
      });
      toast.success(
        completed
          ? "投稿しました。お店に報告しました"
          : "チェックを取り消しました",
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "投稿報告を保存できませんでした。もう一度お試しください",
      );
    } finally {
      busyIds.current.delete(task.id);
      setSavingIds(new Set(busyIds.current));
    }
  };

  const taskRow = (task: TherapistPromotionTask) => (
    <label
      key={task.id}
      className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-3 ${task.isCompleted ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-background"} ${savingIds.has(task.id) ? "cursor-wait opacity-70" : ""}`}
    >
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-primary"
        checked={task.isCompleted}
        disabled={savingIds.has(task.id)}
        onChange={(event) => void report(task, event.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">
          {task.label}
        </span>
        <span
          className={`mt-1 block text-xs font-semibold ${task.isCompleted ? "text-emerald-700 dark:text-emerald-400" : "text-primary"}`}
        >
          投稿しました
          {task.isCompleted && "（報告済み）"}
        </span>
        {task.completedAt && (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            報告日時 {promotionReportedAt(task.completedAt)}
          </span>
        )}
      </span>
      {savingIds.has(task.id) && (
        <Loader2 size={16} className="mt-1 shrink-0 animate-spin" />
      )}
      {task.isCompleted && !savingIds.has(task.id) && (
        <CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />
      )}
    </label>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-primary/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Megaphone size={19} className="text-primary" />
            投稿宣伝スケジュール
          </h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isFetching}
            onClick={() => void refetch()}
            aria-label="スケジュールを再読み込み"
          >
            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          あなた自身のX・O2投稿・O2ストーリーの予定だけを表示しています。投稿できたら「投稿しました」にチェックしてください。お店の管理画面に報告と通知が届きます。バナーやお店の作業は管理画面で管理します。チェックだけではSNSへの投稿は行われません。
        </p>
      </section>

      {isPending ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-2 text-xs text-muted-foreground">
            スケジュールを読み込んでいます
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card p-5 text-center"
        >
          <p className="text-sm text-destructive">
            宣伝スケジュールを取得できませんでした
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
          >
            再試行
          </Button>
        </div>
      ) : !plans.length ? (
        <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          現在、あなた向けの宣伝スケジュールはありません。お店が予定を設定すると、ここに表示されます。
        </div>
      ) : (
        plans.map((plan) => {
          const groups = groupPromotionPostings(plan.tasks);
          const progress = promotionPostingProgress([plan]);
          return (
            <section
              key={plan.id}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <div className="border-b bg-primary/5 p-4">
                <h3 className="break-words text-base font-bold">
                  {plan.title}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays size={13} />
                  {promotionDate(plan.startsOn)}〜{promotionDate(plan.endsOn)}
                </p>
                <p className="mt-2 text-xs font-semibold text-primary">
                  投稿報告 {progress.completed}/{progress.total}件 完了
                </p>
                {plan.description && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {plan.description}
                  </p>
                )}
              </div>
              <div className="space-y-5 p-4">
                {plan.channels.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-bold text-muted-foreground">
                      宣伝先・掲載量・サイズ
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {plan.channels.map((channel) => (
                        <div
                          key={channel.key}
                          className="rounded-lg border bg-muted/20 p-3"
                        >
                          <p className="text-sm font-semibold">
                            {channel.label}{" "}
                            <span className="text-primary">
                              {channel.count}回
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            サイズ・仕様：{channel.sizeSpec || "指定なし"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {groups.map((group) => (
                  <div key={group.key}>
                    <h4 className="mb-2 text-sm font-bold text-primary">
                      {promotionDate(group.date)} · {group.label}
                    </h4>
                    <div className="space-y-2">{group.tasks.map(taskRow)}</div>
                  </div>
                ))}
                {!plan.tasks.length && (
                  <p className="text-sm text-muted-foreground">
                    投稿予定の詳細は準備中です。
                  </p>
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
