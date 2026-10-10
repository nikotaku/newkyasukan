import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addMonths, endOfMonth, format, isSameMonth, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Landmark,
  Loader2,
  Receipt,
  Undo2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  accountNumberTail,
  fixedCostPaymentState,
  scheduledPaymentDate,
  type PaymentState,
} from "@/lib/paymentManagement";
import { bankAccountLine, markShortagePaid } from "@/lib/settlementAdmin";

type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string | null;
  branch_name: string | null;
  account_type: string | null;
  account_number: string | null;
  account_holder: string | null;
};

type FixedCost = {
  id: string;
  item_name: string;
  amount: number;
  payment_day: number | null;
  payment_method: string | null;
  transfer_destination: string | null;
  transfer_account_id: string | null;
  debit_account_id: string | null;
  transfer_account: BankAccount | null;
  debit_account: BankAccount | null;
};

type Expense = {
  id: string;
  expense_date: string;
  expense_type: string;
  amount: number;
  description: string | null;
  payment_method: string | null;
  is_paid: boolean;
};

type TransferRequest = {
  clearance_id: string;
  cast_id: string;
  date: string;
  shortage_amount: number;
  shortage_method: string | null;
  shortage_method_at: string | null;
  shortage_settled_at: string | null;
  shortage_settled_note: string | null;
  casts: { name: string } | null;
};

type CastBankAccount = {
  cast_id: string;
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_number: string;
  account_holder: string;
};

const yen = (value: number) => `¥${Math.round(value || 0).toLocaleString()}`;

function bankLabel(account: BankAccount | null) {
  if (!account) return "";
  return [
    account.account_name,
    account.bank_name,
    account.branch_name,
    account.account_type,
    accountNumberTail(account.account_number),
    account.account_holder,
  ].filter(Boolean).join(" / ");
}

const stateView: Record<PaymentState, { label: string; className: string }> = {
  paid: { label: "支払済み", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  unpaid: { label: "未払い", className: "border-amber-200 bg-amber-50 text-amber-700" },
  overdue: { label: "期限超過", className: "border-rose-200 bg-rose-50 text-rose-700" },
  upcoming: { label: "支払予定", className: "border-sky-200 bg-sky-50 text-sky-700" },
};

export default function PaymentManagement() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [castAccounts, setCastAccounts] = useState<Record<string, CastBankAccount>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const monthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
    const [fixedResult, expenseResult, requestResult] = await Promise.all([
      supabase
        .from("business_fixed_costs" as never)
        .select("id,item_name,amount,payment_day,payment_method,transfer_destination,transfer_account_id,debit_account_id,transfer_account:business_bank_accounts!transfer_account_id(id,account_name,bank_name,branch_name,account_type,account_number,account_holder),debit_account:business_bank_accounts!debit_account_id(id,account_name,bank_name,branch_name,account_type,account_number,account_holder)")
        .order("payment_day", { ascending: true, nullsFirst: false }),
      supabase
        .from("expenses")
        .select("id,expense_date,expense_type,amount,description,payment_method,is_paid")
        .gte("expense_date", monthStart)
        .lte("expense_date", monthEnd)
        .order("expense_date", { ascending: false }),
      supabase
        .from("settlement_approvals" as never)
        .select("clearance_id,cast_id,date,shortage_amount,shortage_method,shortage_method_at,shortage_settled_at,shortage_settled_note,casts(name)")
        .gt("shortage_amount", 0)
        .order("date", { ascending: false })
        .limit(200),
    ]);

    const firstError = fixedResult.error || expenseResult.error || requestResult.error;
    if (firstError) {
      toast.error(`支払い情報を読み込めませんでした: ${firstError.message}`);
      setLoading(false);
      return;
    }

    const requestRows = (requestResult.data ?? []) as unknown as TransferRequest[];
    const castIds = [...new Set(requestRows.map((row) => row.cast_id))];
    let accounts: CastBankAccount[] = [];
    if (castIds.length) {
      const accountResult = await supabase
        .from("cast_bank_accounts" as never)
        .select("cast_id,bank_name,branch_name,account_type,account_number,account_holder")
        .in("cast_id", castIds);
      if (accountResult.error) toast.error(`セラピストの振込先を読み込めませんでした: ${accountResult.error.message}`);
      else accounts = (accountResult.data ?? []) as unknown as CastBankAccount[];
    }

    setFixedCosts((fixedResult.data ?? []) as unknown as FixedCost[]);
    setExpenses((expenseResult.data ?? []) as Expense[]);
    setRequests(requestRows);
    setCastAccounts(Object.fromEntries(accounts.map((account) => [account.cast_id, account])));
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    if (user) void fetchData();
  }, [user, fetchData]);

  const expenseFor = useCallback((itemName: string) =>
    expenses.find((expense) => expense.expense_type.trim() === itemName.trim()) ?? null,
  [expenses]);

  const transferRequests = useMemo(() => requests.filter((request) =>
    request.shortage_method === "transfer"
    && (!request.shortage_settled_at || isSameMonth(new Date(`${request.date}T12:00:00`), selectedMonth)),
  ), [requests, selectedMonth]);
  const openTransfers = transferRequests.filter((request) => !request.shortage_settled_at);
  const paidTransfers = transferRequests.filter((request) => request.shortage_settled_at);
  const nonFixedExpenses = expenses.filter((expense) => !fixedCosts.some((cost) => cost.item_name.trim() === expense.expense_type.trim()));
  const unpaidExpenses = expenses.filter((expense) => !expense.is_paid);
  const scheduledWithoutRecord = fixedCosts.filter((cost) => !expenseFor(cost.item_name));
  const unpaidTotal = openTransfers.reduce((sum, request) => sum + request.shortage_amount, 0)
    + unpaidExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    + scheduledWithoutRecord.reduce((sum, cost) => sum + cost.amount, 0);
  const paidTotal = expenses.filter((expense) => expense.is_paid).reduce((sum, expense) => sum + expense.amount, 0)
    + paidTransfers.reduce((sum, request) => sum + request.shortage_amount, 0);

  const toggleExpensePaid = async (expense: Expense) => {
    setSavingKey(`expense:${expense.id}`);
    const { error } = await supabase.from("expenses").update({ is_paid: !expense.is_paid }).eq("id", expense.id);
    setSavingKey(null);
    if (error) { toast.error(`更新できませんでした: ${error.message}`); return; }
    toast.success(!expense.is_paid ? "支払済みにしました" : "未払いに戻しました");
    void fetchData();
  };

  const recordFixedCost = async (cost: FixedCost, paid: boolean) => {
    const existing = expenseFor(cost.item_name);
    if (existing) {
      if (existing.is_paid === paid) return;
      await toggleExpensePaid(existing);
      return;
    }
    setSavingKey(`fixed:${cost.id}`);
    const isCurrent = isSameMonth(selectedMonth, new Date());
    const expenseDate = isCurrent ? format(new Date(), "yyyy-MM-dd") : format(endOfMonth(selectedMonth), "yyyy-MM-dd");
    const { error } = await supabase.from("expenses").insert({
      expense_date: expenseDate,
      expense_type: cost.item_name,
      amount: cost.amount,
      description: `${format(selectedMonth, "M月", { locale: ja })}分 ${cost.item_name}`,
      payment_method: cost.payment_method || "bank_transfer",
      is_paid: paid,
    });
    setSavingKey(null);
    if (error) { toast.error(`記録できませんでした: ${error.message}`); return; }
    toast.success(paid ? "支払済みで記録しました" : "未払いで記録しました");
    void fetchData();
  };

  const toggleTransferPaid = async (request: TransferRequest) => {
    setSavingKey(`transfer:${request.clearance_id}`);
    try {
      await markShortagePaid(request.clearance_id, !request.shortage_settled_at);
      toast.success(request.shortage_settled_at ? "振込済みを取り消しました" : "振込済みにしました");
      void fetchData();
    } catch (error) {
      toast.error(`更新できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setSavingKey(null);
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">支払い管理</h1>
              <p className="text-sm text-muted-foreground">振込申請・支払予定・振込先・支払状況を一画面で管理</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
              <Button variant="ghost" size="icon" onClick={() => setSelectedMonth((month) => addMonths(month, -1))}><ChevronLeft size={18} /></Button>
              <span className="min-w-28 text-center text-sm font-bold">{format(selectedMonth, "yyyy年M月", { locale: ja })}</span>
              <Button variant="ghost" size="icon" onClick={() => setSelectedMonth((month) => addMonths(month, 1))}><ChevronRight size={18} /></Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard icon={AlertTriangle} label="未払い・支払予定" value={yen(unpaidTotal)} tone="amber" />
            <SummaryCard icon={WalletCards} label="振込申請" value={`${openTransfers.length}件`} tone="rose" />
            <SummaryCard icon={Clock3} label="固定費予定" value={`${fixedCosts.length}件`} tone="sky" />
            <SummaryCard icon={CheckCircle2} label="今月支払済み" value={yen(paidTotal)} tone="emerald" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><WalletCards size={18} />セラピストの振込申請</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {transferRequests.length === 0 ? <Empty text="振込申請はありません" /> : (
                <div className="divide-y">
                  {transferRequests.map((request) => {
                    const account = castAccounts[request.cast_id];
                    const paid = Boolean(request.shortage_settled_at);
                    return (
                      <div key={request.clearance_id} className="grid gap-3 p-4 lg:grid-cols-[140px_120px_1fr_auto] lg:items-center">
                        <div><p className="font-semibold">{request.casts?.name || "セラピスト"}</p><p className="text-xs text-muted-foreground">{format(new Date(`${request.date}T12:00:00`), "M/d(E)", { locale: ja })}の精算</p></div>
                        <p className="font-bold tabular-nums text-amber-700">{yen(request.shortage_amount)}</p>
                        <div className="min-w-0 text-xs">
                          {account ? <p className="break-words font-mono">振込先：{bankAccountLine(account)}</p> : <p className="text-rose-600">振込先口座が未入力です</p>}
                          {request.shortage_method_at && <p className="mt-1 text-muted-foreground">申請 {format(new Date(request.shortage_method_at), "M/d HH:mm")}</p>}
                        </div>
                        <div className="flex items-center justify-between gap-2 lg:justify-end">
                          <Badge variant="outline" className={paid ? stateView.paid.className : stateView.unpaid.className}>{paid ? "振込済み" : "未払い"}</Badge>
                          <Button size="sm" variant={paid ? "ghost" : "default"} disabled={savingKey === `transfer:${request.clearance_id}` || (!paid && !account)} onClick={() => void toggleTransferPaid(request)}>
                            {savingKey === `transfer:${request.clearance_id}` ? <Loader2 size={14} className="animate-spin" /> : paid ? <><Undo2 size={14} className="mr-1" />取り消す</> : <><CheckCircle2 size={14} className="mr-1" />振込済みにする</>}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Clock3 size={18} />固定費の支払スケジュール</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {fixedCosts.length === 0 ? <Empty text="固定費が登録されていません" /> : (
                <div className="divide-y">
                  {fixedCosts.map((cost) => {
                    const expense = expenseFor(cost.item_name);
                    const state = fixedCostPaymentState({ paymentDay: cost.payment_day, paid: Boolean(expense?.is_paid), recorded: Boolean(expense), selectedMonth });
                    const due = scheduledPaymentDate(selectedMonth.getFullYear(), selectedMonth.getMonth(), cost.payment_day);
                    const destination = bankLabel(cost.transfer_account) || cost.transfer_destination || "振込先未登録";
                    return (
                      <div key={cost.id} className="grid gap-3 p-4 lg:grid-cols-[110px_1fr_140px_auto] lg:items-center">
                        <div><p className="text-xs text-muted-foreground">支払日</p><p className="font-semibold">{due ? format(due, "M/d(E)", { locale: ja }) : "未設定"}</p></div>
                        <div className="min-w-0"><p className="font-semibold">{cost.item_name}</p><p className={`mt-1 break-words text-xs ${destination === "振込先未登録" ? "text-rose-600" : "text-muted-foreground"}`}>振込先：{destination}</p>{cost.debit_account && <p className="mt-0.5 text-xs text-muted-foreground">支払元：{bankLabel(cost.debit_account)}</p>}</div>
                        <p className="font-bold tabular-nums">{yen(expense?.amount ?? cost.amount)}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
                          <Badge variant="outline" className={stateView[state].className}>{stateView[state].label}</Badge>
                          {state === "paid" ? <Button size="sm" variant="ghost" disabled={savingKey === `expense:${expense?.id}`} onClick={() => expense && void toggleExpensePaid(expense)}><Undo2 size={14} className="mr-1" />未払いに戻す</Button> : <>
                            {!expense && <Button size="sm" variant="outline" disabled={savingKey === `fixed:${cost.id}`} onClick={() => void recordFixedCost(cost, false)}>未払いで記録</Button>}
                            <Button size="sm" disabled={savingKey === `fixed:${cost.id}` || savingKey === `expense:${expense?.id}`} onClick={() => void recordFixedCost(cost, true)}><CheckCircle2 size={14} className="mr-1" />支払済みにする</Button>
                          </>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="border-t bg-muted/30 p-3 text-right"><Button variant="link" size="sm" onClick={() => navigate("/business-continuity/fixed-costs")}>固定費・振込先の設定を開く</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Receipt size={18} />その他の支払い・履歴</CardTitle></CardHeader>
            <CardContent className="p-0">
              {nonFixedExpenses.length === 0 ? <Empty text="この月のその他の支払いはありません" /> : <div className="divide-y">
                {nonFixedExpenses.map((expense) => (
                  <div key={expense.id} className="grid gap-2 p-4 sm:grid-cols-[100px_1fr_120px_auto] sm:items-center">
                    <p className="text-sm">{format(new Date(`${expense.expense_date}T12:00:00`), "M/d(E)", { locale: ja })}</p>
                    <div><p className="font-medium">{expense.expense_type}</p><p className="text-xs text-muted-foreground">{expense.description || expense.payment_method || "詳細なし"}</p></div>
                    <p className="font-bold tabular-nums">{yen(expense.amount)}</p>
                    <div className="flex items-center gap-2"><Badge variant="outline" className={expense.is_paid ? stateView.paid.className : stateView.unpaid.className}>{expense.is_paid ? "支払済み" : "未払い"}</Badge><Button size="sm" variant={expense.is_paid ? "ghost" : "default"} disabled={savingKey === `expense:${expense.id}`} onClick={() => void toggleExpensePaid(expense)}>{expense.is_paid ? "未払いに戻す" : "支払済みにする"}</Button></div>
                  </div>
                ))}
              </div>}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 pb-8">
            <Button variant="outline" onClick={() => navigate("/business-continuity/bank-accounts")}><Landmark size={16} className="mr-2" />銀行口座管理</Button>
            <Button variant="outline" onClick={() => navigate("/sales/monthly-closing")}><Receipt size={16} className="mr-2" />月別清算</Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof AlertTriangle; label: string; value: string; tone: "amber" | "rose" | "sky" | "emerald" }) {
  const colors = { amber: "text-amber-700 bg-amber-50", rose: "text-rose-700 bg-rose-50", sky: "text-sky-700 bg-sky-50", emerald: "text-emerald-700 bg-emerald-50" };
  return <Card><CardContent className="p-4"><div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${colors[tone]}`}><Icon size={17} /></div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold tabular-nums md:text-xl">{value}</p></CardContent></Card>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
