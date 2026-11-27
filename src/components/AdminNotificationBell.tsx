// 管理画面のヘッダーのベル。まだ対応していないものをためて知らせる：
// ・セラピストから届いた精算（承認するまで残る。タップで日別精算のその人の清算明細）
// ・セラピストの投稿完了報告（確認済みにするまで残る）
import { Link } from "react-router-dom";
import { Bell, Megaphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTherapistPromotionReports } from "@/hooks/useTherapistPromotion";
import { usePendingSettlements } from "@/hooks/usePendingSettlements";
import { pendingSettlementUrl, settlementDayLabel } from "@/lib/pendingSettlements";
import { promotionPlanUrl, promotionReportedAt } from "@/lib/therapistPromotion";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function AdminNotificationBell({ storeId }: { storeId: string | undefined }) {
  const { data: settlements = [] } = usePendingSettlements(storeId);
  const { data: reports = [] } = useTherapistPromotionReports(storeId, true);
  const total = settlements.length + reports.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="relative h-8 w-8 shrink-0 p-0"
          aria-label={`お知らせ${total ? ` 未対応${total}件` : ""}`}
        >
          <Bell size={17} />
          {total > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1rem))] p-0">
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2 text-xs font-bold">
            <Wallet size={14} className="text-primary" />
            届いた精算（未承認 {settlements.length}件）
          </div>
          {settlements.length ? (
            <div className="divide-y">
              {settlements.map((item) => (
                <Link key={`${item.castId}-${item.date}`} to={pendingSettlementUrl(item)} className="block px-4 py-3 hover:bg-muted/50">
                  <p className="text-sm font-semibold">{item.castName}さんから精算が届きました</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {settlementDayLabel(item.date)} の精算
                    {item.totalAmount != null && item.totalAmount > 0 && ` · 売上 ${yen(item.totalAmount)}`}
                  </p>
                  <p className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{promotionReportedAt(item.submittedAt)}</span>
                    <span className="font-semibold text-primary">明細を見て承認 →</span>
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-4 py-4 text-center text-xs text-muted-foreground">未承認の精算はありません</p>
          )}

          <div className="flex items-center gap-1.5 border-y bg-muted/40 px-4 py-2 text-xs font-bold">
            <Megaphone size={14} className="text-primary" />
            投稿完了報告（未確認 {reports.length}件）
          </div>
          {reports.length ? (
            <div className="divide-y">
              {reports.slice(0, 5).map((report) => (
                <Link key={report.id} to={promotionPlanUrl(report.planId)} className="block px-4 py-3 hover:bg-muted/50">
                  <p className="text-sm font-semibold">{report.castName}さんが投稿しました</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{report.taskLabel}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{promotionReportedAt(report.completedAt)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-4 py-4 text-center text-xs text-muted-foreground">未確認の投稿報告はありません</p>
          )}
          <Link
            to="/promotion-schedule?tab=plans&reports=1"
            className="block border-t px-4 py-3 text-center text-xs font-semibold text-primary hover:bg-muted/50"
          >
            投稿報告を確認する
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
