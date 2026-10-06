import { useMemo } from "react";
import { format } from "date-fns";
import { CheckCircle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clearanceReceiptDataUrl, type ClearanceReceiptData } from "@/lib/clearanceReceipt";
import { settlementCashToDeposit, settlementShortage } from "@/lib/settlementApproval";

const yen = (value: number) => `¥${Math.round(value).toLocaleString()}`;

interface SettlementReceiptDialogProps {
  receipt: ClearanceReceiptData | null;
  /** マイページから精算が届いた時刻 */
  submittedAt: string | null;
  approvedAt: string | null;
  approving: boolean;
  onApprove: () => void;
  onDownload: () => void;
  onClose: () => void;
}

/** 清算明細の画像を見て「金額を承認」する（スマホ通知から開いたときもここが出る） */
export function SettlementReceiptDialog({
  receipt,
  submittedAt,
  approvedAt,
  approving,
  onApprove,
  onDownload,
  onClose,
}: SettlementReceiptDialogProps) {
  const imageUrl = useMemo(() => (receipt ? clearanceReceiptDataUrl(receipt) : null), [receipt]);
  const shortage = receipt ? settlementShortage(receipt.cashTotal, receipt.salary) : 0;
  const deposit = receipt ? settlementCashToDeposit(receipt.cashTotal, receipt.salary) : 0;

  return (
    <Dialog open={!!receipt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{receipt?.castName} さんの清算明細</DialogTitle>
          <DialogDescription>
            {submittedAt
              ? `マイページから精算が届きました（${format(new Date(submittedAt), "M/d HH:mm")}）`
              : "マイページからの精算はまだ届いていません"}
            {approvedAt && ` · ${format(new Date(approvedAt), "M/d HH:mm")} に承認済み`}
          </DialogDescription>
        </DialogHeader>

        {receipt && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/40 px-2 py-2">
                <p className="text-[10px] text-muted-foreground">お給料</p>
                <p className="text-sm font-bold tabular-nums text-blue-700">{yen(receipt.salary)}</p>
              </div>
              <div className="rounded-md bg-muted/40 px-2 py-2">
                <p className="text-[10px] text-muted-foreground">現金預かり</p>
                <p className="text-sm font-bold tabular-nums">{yen(receipt.cashTotal)}</p>
              </div>
              {shortage > 0 ? (
                <div className="rounded-md bg-amber-50 px-2 py-2">
                  <p className="text-[10px] text-amber-800">給与の不足分</p>
                  <p className="text-sm font-bold tabular-nums text-amber-700">{yen(shortage)}</p>
                </div>
              ) : (
                <div className="rounded-md bg-primary/5 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">投函する現金</p>
                  <p className="text-sm font-bold tabular-nums text-primary">{yen(deposit)}</p>
                </div>
              )}
            </div>
            {shortage > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                承認すると、マイページに「精算が承認されました。不足分 {yen(shortage)} は、振込もしくは次回出勤日の相殺になります」と出て、受け取り方を選んでもらいます（振込なら振込先も入力してもらいます）
              </p>
            )}
            {imageUrl && (
              <img src={imageUrl} alt={`${receipt.castName}さんの清算明細`} className="w-full rounded-md border" />
            )}
            <p className="text-[11px] text-muted-foreground">
              金額を直すときは、閉じて下の入力欄を直してから承認してください。承認すると明細がセラピストのマイページに届きます（LINEで送る必要はありません）
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onDownload} disabled={!receipt}>
            <Download size={14} className="mr-1.5" />保存
          </Button>
          <Button className="flex-1" onClick={onApprove} disabled={!receipt || approving}>
            {approving
              ? <Loader2 size={14} className="mr-2 animate-spin" />
              : <CheckCircle size={14} className="mr-2" />}
            {approvedAt ? "承認し直す（上書き）" : "金額を承認"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
