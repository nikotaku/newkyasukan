import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_SPLIT_ROWS, type SplitRow, balanceSplit, splitError } from "@/lib/therapistSplitPayment";

const METHOD_LABELS: Record<string, string> = { cash: "現金", card: "カード", paypay: "PayPay" };

/** 精算の「支払いを分ける」：方法と金額の行。最後の行は残りの金額が自動で入る */
export function SplitPaymentFields({
  rows,
  price,
  cardFeePct,
  paypayFeePct,
  onChange,
}: {
  rows: SplitRow[];
  price: number;
  cardFeePct: number;
  paypayFeePct: number;
  onChange: (rows: SplitRow[]) => void;
}) {
  const balanced = balanceSplit(rows, price);
  const error = splitError(balanced, price);
  const feeLabel = (method: string) => {
    const pct = method === "card" ? cardFeePct : method === "paypay" ? paypayFeePct : 0;
    return pct ? `（手数料${pct}%）` : "";
  };

  const update = (index: number, patch: Partial<SplitRow>) =>
    onChange(balanced.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="mt-1 space-y-1.5 rounded-lg border bg-muted/30 p-2">
      {balanced.map((row, index) => {
        const isLast = index === balanced.length - 1;
        return (
          <div key={index} className="flex items-center gap-1.5">
            <Select value={row.method} onValueChange={(value) => update(index, { method: value })}>
              <SelectTrigger className="h-9 w-32 shrink-0 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">{label}{feeLabel(value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">¥</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              className="h-9 flex-1 text-xs"
              value={row.amount || ""}
              readOnly={isLast}
              onChange={(event) => update(index, { amount: Math.max(0, Number(event.target.value) || 0) })}
            />
            {balanced.length > 2 ? (
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="この行を消す"
                onClick={() => onChange(balanced.filter((_, i) => i !== index))}>
                <X size={14} />
              </Button>
            ) : <span className="w-8 shrink-0" />}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">最後の行は残りの金額が自動で入ります</p>
        {balanced.length < MAX_SPLIT_ROWS && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
            onClick={() => onChange([...balanced, { method: "cash", amount: 0 }])}>
            <Plus size={12} className="mr-0.5" />追加
          </Button>
        )}
      </div>
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}
