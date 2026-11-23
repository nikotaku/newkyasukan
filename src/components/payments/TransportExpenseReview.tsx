import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Check, Loader2, Plane, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

// 支払い管理の「交通費の申請」：セラピストがマイページから出した交通費の申請を、領収書の写真を見て承認・却下する。
// 申請中は月に関係なく全部、処理済みは直近60日。領収書は非公開バケット transport-receipts（自分の店舗の分だけ読める）。

type Expense = {
  id: string;
  cast_id: string;
  expense_date: string;
  amount: number;
  route: string | null;
  notes: string | null;
  status: string;
  receipt_path: string | null;
};

const db = supabase as unknown as { from: (table: string) => any };
const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "申請中", className: "border-amber-200 bg-amber-50 text-amber-700" },
  approved: { label: "承認済", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rejected: { label: "却下", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function TransportExpenseReview({ storeId }: { storeId: string | null }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const since = format(new Date(Date.now() - 60 * 86400000), "yyyy-MM-dd");
    const { data, error } = await db.from("therapist_transport_expenses")
      .select("id,cast_id,expense_date,amount,route,notes,status,receipt_path")
      .eq("store_id", storeId)
      .or(`status.eq.pending,expense_date.gte.${since}`)
      .order("expense_date", { ascending: false })
      .limit(200);
    if (error) { toast.error("交通費の申請を読み込めませんでした"); setLoading(false); return; }
    const list = (data ?? []) as Expense[];
    const ids = [...new Set(list.map((r) => r.cast_id))];
    if (ids.length) {
      const { data: casts } = await db.from("casts").select("id,name").in("id", ids);
      setNames(Object.fromEntries((casts ?? []).map((c: { id: string; name: string }) => [c.id, c.name])));
    }
    setRows(list);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const openReceipt = async (row: Expense) => {
    if (!row.receipt_path) return;
    setBusyId(row.id);
    const { data, error } = await supabase.storage.from("transport-receipts").createSignedUrl(row.receipt_path, 600);
    setBusyId(null);
    if (error || !data?.signedUrl) { toast.error("領収書を開けませんでした"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const setStatus = async (row: Expense, status: "approved" | "rejected" | "pending") => {
    if (status === "approved" && !row.receipt_path && !confirm("領収書がありません。承認しますか？")) return;
    setBusyId(row.id);
    const { error } = await db.from("therapist_transport_expenses")
      .update({ status, reviewed_at: status === "pending" ? null : new Date().toISOString() })
      .eq("id", row.id);
    setBusyId(null);
    if (error) { toast.error("更新できませんでした"); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
  };

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  const renderRow = (row: Expense) => {
    const status = STATUS[row.status] ?? STATUS.pending;
    const busy = busyId === row.id;
    return (
      <div key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {names[row.cast_id] ?? "（不明）"}　¥{row.amount.toLocaleString()}
            <Badge variant="outline" className={`ml-2 ${status.className}`}>{status.label}</Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(`${row.expense_date}T00:00:00`), "M/d(E)", { locale: ja })}
            {row.route && `・${row.route}`}
            {row.notes && `・${row.notes}`}
          </p>
        </div>
        {row.receipt_path ? (
          <Button size="sm" variant="outline" onClick={() => void openReceipt(row)} disabled={busy}>
            <Receipt size={14} className="mr-1" />領収書
          </Button>
        ) : (
          <span className="text-xs text-amber-600">領収書なし</span>
        )}
        {busy ? <Loader2 size={16} className="animate-spin" /> : row.status === "pending" ? (
          <>
            <Button size="sm" onClick={() => void setStatus(row, "approved")}><Check size={14} className="mr-1" />承認</Button>
            <Button size="sm" variant="ghost" onClick={() => void setStatus(row, "rejected")}><X size={14} className="mr-1" />却下</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => void setStatus(row, "pending")}>申請中に戻す</Button>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Plane size={18} />交通費の申請（マイページから）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">申請はありません</p>
        ) : (
          <>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">申請中（{pending.length}件）</p>
              {pending.length === 0 ? <p className="text-xs text-muted-foreground">ありません</p> : (
                <div className="divide-y rounded-md border">{pending.map(renderRow)}</div>
              )}
            </div>
            {done.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">処理済み（直近60日・{done.length}件）</summary>
                <div className="mt-2 divide-y rounded-md border">{done.map(renderRow)}</div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
