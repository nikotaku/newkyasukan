import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  CASH_RETURN_KINDS,
  CASH_RETURN_REASONS,
  cashReturnKindLabel,
  cashReturnTotal,
  type CashReturn,
  type CashReturnKind,
} from "@/lib/cashReturns";
import { toExtTime } from "@/lib/timeFormat";

type ReservationLite = { id: string; customer_name: string | null; start_time: string | null; status: string | null };

const yen = (value: number) => `¥${value.toLocaleString()}`;

/**
 * マイページの精算：お客様に返したお金（キャッシュバック・返金）を申告する。
 * 申告した分はお店の日別精算に自動で入り、お店が返す（セラピストの取り分は減らない）。
 */
export function TherapistCashReturns({ token, reservations }: { token: string; reservations: ReservationLite[] }) {
  const active = useMemo(() => reservations.filter((r) => r.status !== "cancelled"), [reservations]);
  const reservationIds = useMemo(() => active.map((r) => r.id), [active]);
  const [items, setItems] = useState<CashReturn[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const [kind, setKind] = useState<CashReturnKind>("refund");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(CASH_RETURN_REASONS[0]);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (reservationIds.length === 0) {
      setItems([]);
      return;
    }
    const { data, error } = await supabase.rpc("get_therapist_cash_returns" as never, {
      p_token: token,
      p_reservation_ids: reservationIds,
    } as never);
    if (error) {
      console.warn("返金の読み込みに失敗:", error.message);
      return;
    }
    setItems((data as unknown as CashReturn[]) ?? []);
  }, [reservationIds, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!reservationIds.includes(reservationId)) setReservationId(reservationIds[0] ?? "");
  }, [reservationId, reservationIds]);

  if (active.length === 0) return null;

  const nameOf = (id: string) => {
    const r = active.find((item) => item.id === id);
    return r ? `${r.start_time ? toExtTime(r.start_time) : ""} ${r.customer_name ?? ""}様`.trim() : "";
  };

  const save = async () => {
    const value = Math.round(Number(amount));
    if (!reservationId) {
      toast.error("どの予約か選んでください");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("金額を入れてください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("save_therapist_cash_return" as never, {
      p_token: token,
      p_reservation_id: reservationId,
      p_kind: kind,
      p_amount: value,
      p_reason: reason,
      p_note: note.trim() || null,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(`記録できませんでした：${error.message}`);
      return;
    }
    toast.success(`${cashReturnKindLabel(kind)} ${yen(value)} を記録しました。お店が精算で返します`);
    setAmount("");
    setNote("");
    setOpen(false);
    void load();
  };

  const cancel = async (item: CashReturn) => {
    if (!window.confirm(`${cashReturnKindLabel(item.kind)} ${yen(item.amount)} の記録を取り消しますか？`)) return;
    const { data, error } = await supabase.rpc("cancel_therapist_cash_return" as never, { p_token: token, p_id: item.id } as never);
    if (error || data === false) {
      toast.error("取り消せませんでした（精算が済んだ日の分はお店に連絡してください）");
      return;
    }
    toast.success("取り消しました");
    void load();
  };

  const total = cashReturnTotal(items);

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">💴 お客様に返したお金</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          キャッシュバックや、自分の財布からお客様に返金したときに記録してください。お店が精算でその分を返します（あなたの取り分は減りません）
        </p>

        {items.length > 0 && (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded border bg-amber-50/60 px-2 py-1.5 text-xs">
                <span>
                  <span className="font-semibold">{cashReturnKindLabel(item.kind)} {yen(item.amount)}</span>
                  <span className="text-muted-foreground">　{nameOf(item.reservation_id)}・{item.reason}{item.note ? `・${item.note}` : ""}</span>
                  {item.source === "staff" && <span className="ml-1 text-sky-700">お店が記録</span>}
                </span>
                {item.source === "therapist" && (
                  <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void cancel(item)}>
                    取り消す
                  </button>
                )}
              </li>
            ))}
            <li className="flex justify-between px-2 pt-1 text-xs font-semibold text-amber-900">
              <span>お店が精算で返す額</span>
              <span>{yen(total)}</span>
            </li>
          </ul>
        )}

        {open ? (
          <div className="space-y-2 rounded border p-2">
            <select
              className="h-9 w-full rounded-md border bg-white px-2 text-sm"
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              aria-label="どの予約か"
            >
              {active.map((r) => <option key={r.id} value={r.id}>{nameOf(r.id)}</option>)}
            </select>
            <div className="flex gap-1.5">
              {CASH_RETURN_KINDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-semibold ${kind === option.value ? "border-amber-400 bg-amber-100 text-amber-900" : "bg-white text-muted-foreground"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                className="w-32"
                type="number"
                min="0"
                step="100"
                inputMode="numeric"
                placeholder="金額（円）"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <select
                className="h-10 flex-1 rounded-md border bg-white px-2 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="理由"
              >
                {CASH_RETURN_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <Input placeholder="メモ（任意）" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>やめる</Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? "記録中..." : "記録する"}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
            ＋ お客様に返したお金を記録する
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
