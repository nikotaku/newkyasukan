import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  Loader2,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useAcknowledgePromotionReport,
  useTherapistPromotionReports,
} from "@/hooks/useTherapistPromotion";
import {
  promotionDate,
  promotionPlanUrl,
  promotionReportedAt,
} from "@/lib/therapistPromotion";

export function TherapistPromotionReports({
  storeId,
}: {
  storeId: string | undefined;
}) {
  const [showReviewed, setShowReviewed] = useState(false);
  const {
    data: reports = [],
    isPending,
    error,
    refetch,
    isFetching,
  } = useTherapistPromotionReports(storeId, !showReviewed);
  const acknowledge = useAcknowledgePromotionReport(storeId);
  const locks = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const markSeen = async (id: string) => {
    if (locks.current.has(id)) return;
    locks.current.add(id);
    setBusyIds(new Set(locks.current));
    try {
      await acknowledge(id);
      toast.success("投稿報告を確認済みにしました");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "確認状態を保存できませんでした",
      );
    } finally {
      locks.current.delete(id);
      setBusyIds(new Set(locks.current));
    }
  };

  return (
    <section
      id="promotion-reports"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/5 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Megaphone size={18} className="text-primary" />
          セラピストからの投稿報告
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showReviewed}
              onChange={(event) => setShowReviewed(event.target.checked)}
            />
            確認済みも表示
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={isFetching}
            onClick={() => void refetch()}
            aria-label="投稿報告を再読み込み"
          >
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      {isPending ? (
        <div className="p-5 text-center">
          <Loader2 size={20} className="mx-auto animate-spin text-primary" />
        </div>
      ) : error ? (
        <div role="alert" className="p-4 text-sm text-destructive">
          投稿報告を読み込めませんでした。
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void refetch()}
          >
            再試行
          </button>
        </div>
      ) : !reports.length ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {showReviewed
            ? "投稿報告はまだありません"
            : "未確認の投稿報告はありません"}
        </p>
      ) : (
        <div className="divide-y">
          {(showAll ? reports : reports.slice(0, 10)).map((report) => (
            <div
              key={report.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {report.castName}さんが投稿しました
                  {!report.adminSeenAt && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                      未確認
                    </span>
                  )}
                </p>
                <p className="mt-1 break-words text-sm">{report.taskLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  予定日 {promotionDate(report.scheduledOn)} ／ 報告{" "}
                  {promotionReportedAt(report.completedAt)}
                </p>
                <Link
                  to={promotionPlanUrl(report.planId)}
                  className="mt-1 inline-block break-words text-xs text-primary underline"
                >
                  {report.planTitle}のスケジュールを見る
                </Link>
              </div>
              {report.adminSeenAt ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 size={14} />
                  確認済み
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 self-start"
                  disabled={busyIds.has(report.id)}
                  onClick={() => void markSeen(report.id)}
                >
                  {busyIds.has(report.id) ? (
                    <Loader2 size={14} className="mr-1 animate-spin" />
                  ) : (
                    <Check size={14} className="mr-1" />
                  )}
                  確認済みにする
                </Button>
              )}
            </div>
          ))}
          {!showAll && reports.length > 10 && (
            <div className="p-3 text-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAll(true)}
              >
                ほかの報告も表示（
                {reports.length >= 200 ? "最新200" : reports.length}件）
              </Button>
            </div>
          )}
        </div>
      )}
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        本人の投稿報告です。店舗側のタスク完了とは分けて管理します。報告は30秒ごと・画面に戻ったときに更新します。
      </p>
    </section>
  );
}
