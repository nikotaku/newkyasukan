import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  CASH_RETURN_KINDS,
  CASH_RETURN_REASONS,
  cashReturnKindLabel,
  type CashReturn,
  type CashReturnKind,
} from "@/lib/cashReturns";

const yen = (value: number) => `¥${value.toLocaleString()}`;

/**
 * 予約詳細の「キャッシュバック・返金」。ここに記録すると、その日の日別精算に自動で入り、
 * お店がセラピストに返す（お店の負担・売上から引く）。
 */
export function ReservationCashReturns({ reservationId }: { reservationId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<CashReturn[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<CashReturnKind>("cashback");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(CASH_RETURN_REASONS[0]);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("reservation_cash_returns" as never)
      .select("id, reservation_id, cast_id, kind, amount, reason, note, source, created_at")
      .eq("reservation_id", reservationId)
      .is("cancelled_at", null)
      .order("created_at");
    if (error) {
      console.warn("返金・キャッシュバックの読み込みに失敗:", error.message);
      return;
    }
    setItems((data as unknown as CashReturn[]) ?? []);
  }, [reservationId]);

  useEffect(() => {
    setOpen(false);
    void load();
  }, [load]);

  const save = async () => {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      toast({ title: "金額を入れてください", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("reservation_cash_returns" as never)
      .insert({ reservation_id: reservationId, kind, amount: value, reason, note: note.trim() || null, source: "staff" } as never);
    setSaving(false);
    if (error) {
      toast({ title: "記録できませんでした", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${cashReturnKindLabel(kind)} ${yen(value)} を記録しました`, description: "その日の日別精算に自動で入ります" });
    setAmount("");
    setNote("");
    setOpen(false);
    void load();
  };

  const cancel = async (item: CashReturn) => {
    if (!window.confirm(`${cashReturnKindLabel(item.kind)} ${yen(item.amount)} の記録を取り消しますか？`)) return;
    const { error } = await supabase
      .from("reservation_cash_returns" as never)
      .update({ cancelled_at: new Date().toISOString() } as never)
      .eq("id", item.id);
    if (error) {
      toast({ title: "取り消せませんでした", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "取り消しました", description: "締めた精算に入っている場合は、日別精算で直してください" });
    void load();
  };

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-amber-900">💴 キャッシュバック・返金</span>
        {!open && (
          <Button type="button" size="sm" variant="outline" className="h-7 bg-white px-2 text-xs" onClick={() => setOpen(true)}>
            記録する
          </Button>
        )}
      </div>

      {items.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs">
              <span>
                <span className="font-semibold">{cashReturnKindLabel(item.kind)} {yen(item.amount)}</span>
                <span className="text-muted-foreground">（{item.reason}{item.note ? `・${item.note}` : ""}）</span>
                {item.source === "therapist" && <span className="ml-1 text-sky-700">本人申告</span>}
              </span>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void cancel(item)}>
                取り消す
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !open && <p className="mt-1 text-[11px] text-muted-foreground">お客様にお金を返したら記録してください。日別精算に自動で入り、お店がセラピストに返します</p>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5">
            {CASH_RETURN_KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.hint}
                onClick={() => setKind(option.value)}
                className={`flex-1 rounded border px-2 py-1 text-xs font-semibold ${kind === option.value ? "border-amber-400 bg-amber-100 text-amber-900" : "bg-white text-muted-foreground"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              className="h-8 w-32 bg-white text-xs"
              type="number"
              min="0"
              step="100"
              inputMode="numeric"
              placeholder="金額（円）"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select
              className="h-8 flex-1 rounded-md border bg-white px-2 text-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="理由"
            >
              {CASH_RETURN_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <Input className="h-8 bg-white text-xs" placeholder="メモ（任意）" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>やめる</Button>
            <Button type="button" size="sm" className="h-7 px-3 text-xs" disabled={saving} onClick={() => void save()}>
              {saving ? "記録中..." : "記録する"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
