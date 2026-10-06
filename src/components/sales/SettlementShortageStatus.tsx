import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  bankAccountLine,
  markShortagePaid,
  type CastBankAccountRow,
  type SettlementApprovalRow,
} from "@/lib/settlementAdmin";
import { SHORTAGE_METHOD_LABELS } from "@/lib/settlementApproval";

const yen = (value: number) => `¥${Math.round(value).toLocaleString()}`;

/** 不足分の受け取り方（振込・次回出勤日に相殺）と、払い終わったか */
export function ShortageState({ approval, account, onChanged }: {
  approval: SettlementApprovalRow;
  account: CastBankAccountRow | null;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (approval.shortage_amount <= 0) return null;

  const setPaid = async (paid: boolean) => {
    setSaving(true);
    try {
      await markShortagePaid(approval.clearance_id, paid);
      toast.success(paid ? "振込済みにしました" : "振込済みを取り消しました");
      onChanged();
    } catch (error) {
      toast.error(`保存できませんでした：${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setSaving(false);
    }
  };

  if (approval.shortage_settled_at) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-emerald-700">
        <span className="flex items-center gap-1">
          <CheckCircle size={12} />
          不足分 {yen(approval.shortage_amount)}：{approval.shortage_settled_note || "支払い済み"}（{format(new Date(approval.shortage_settled_at), "M/d")}）
        </span>
        {approval.shortage_settled_note === "振込済み" && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={saving} onClick={() => setPaid(false)}>
            <Undo2 size={11} className="mr-1" />取り消す
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-xs">
      <p className="font-semibold text-amber-800">
        不足分 {yen(approval.shortage_amount)}：
        {approval.shortage_method ? `${SHORTAGE_METHOD_LABELS[approval.shortage_method]}を希望` : "受け取り方の選択待ち（マイページで選んでもらいます）"}
      </p>
      {approval.shortage_method === "offset" && (
        <p className="text-muted-foreground">次の出勤日の精算に「前回の不足分」として自動で入ります</p>
      )}
      {approval.shortage_method === "transfer" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={account ? "font-mono text-[11px]" : "text-muted-foreground"}>
            {account ? `振込先：${bankAccountLine(account)}` : "振込先はまだ入力されていません（マイページで入力してもらいます）"}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={saving} onClick={() => setPaid(true)}>
            {saving ? <Loader2 size={11} className="mr-1 animate-spin" /> : <CheckCircle size={11} className="mr-1" />}
            振込済みにする
          </Button>
        </div>
      )}
    </div>
  );
}

/** 日別精算の上に出す「まだ払っていない不足分」（全部の日） */
export function OutstandingShortages({ rows, accounts, onOpenDate, onChanged }: {
  rows: SettlementApprovalRow[];
  accounts: Record<string, CastBankAccountRow>;
  onOpenDate: (date: string, castId: string) => void;
  onChanged: () => void;
}) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.shortage_amount, 0);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
      <p className="text-sm font-bold text-amber-900">
        まだ払っていない給与の不足分（{rows.length}件・{yen(total)}）
      </p>
      <div className="divide-y divide-amber-200/70">
        {rows.map((row) => (
          <div key={row.clearance_id} className="py-2 space-y-1">
            <button
              type="button"
              className="text-left text-xs font-semibold hover:underline"
              onClick={() => onOpenDate(row.date, row.cast_id)}
            >
              {format(parseISO(row.date), "M/d")} {row.casts?.name ?? "セラピスト"} さん
            </button>
            <ShortageState approval={row} account={accounts[row.cast_id] ?? null} onChanged={onChanged} />
          </div>
        ))}
      </div>
    </div>
  );
}
