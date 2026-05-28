import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, DollarSign, Receipt, Plane, CalendarPlus, LogOut, ChevronLeft, Send, Calendar, Edit, Banknote, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import backRatesImage from "@/assets/back-rates-table.jpg";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface PendingClearance {
  id: string;
  date: string;
  payout_amount: number;
  payout_method: string | null;
  status: string;
}

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

interface Settlement {
  id: string;
  reservation_date: string;
  start_time: string;
  duration: number;
  course_name: string;
  customer_price: number;
  therapist_back: number;
  status: string;
}

interface TransportExpense {
  id: string;
  expense_date: string;
  amount: number;
  route: string | null;
  notes: string | null;
  status: string;
}

interface ShiftRow {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  notes: string | null;
  approval_status: string;
}

type View = "menu" | "settlement" | "transport" | "shift";

const now = new Date();

export default function TherapistPortal() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [cast, setCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("menu");
  const [showBackRates, setShowBackRates] = useState(false);

  // Settlement
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Shifts
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);

  // Clearance notification
  const [pendingClearance, setPendingClearance] = useState<PendingClearance | null>(null);

  // Transport
  const [expenses, setExpenses] = useState<TransportExpense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [transportForm, setTransportForm] = useState({
    date: format(now, "yyyy-MM-dd"),
    amount: "",
    route: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    supabase.rpc("get_cast_by_access_token", { p_token: token }).then(({ data, error }) => {
      if (error || !data) {
        toast.error("無効なアクセスリンクです");
        navigate("/");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { toast.error("無効なアクセスリンクです"); navigate("/"); return; }
      const castRow = row as Cast;
      setCast(castRow);
      setLoading(false);
      // Check for pending clearance
      supabase
        .from("daily_clearances" as any)
        .select("id, date, payout_amount, payout_method, status")
        .eq("cast_id", castRow.id)
        .eq("status", "pending")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setPendingClearance(data as PendingClearance | null));
    });
  }, [token, navigate]);

  useEffect(() => {
    if (view === "settlement" && cast) fetchSettlements();
    if (view === "transport" && cast) fetchExpenses();
    if (view === "shift" && cast) fetchShifts();
  }, [view, year, month, cast]);

  // シフトのステータス変更をリアルタイム反映
  useEffect(() => {
    if (view !== "shift" || !cast) return;
    const channel = supabase
      .channel(`therapist-shifts-${cast.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts", filter: `cast_id=eq.${cast.id}` },
        () => fetchShifts()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, cast, year, month]);

  const fetchShifts = async () => {
    setShiftsLoading(true);
    const { data, error } = await supabase.rpc("get_therapist_shifts", {
      p_token: token, p_year: year, p_month: month,
    });
    if (error) toast.error("シフトの取得に失敗しました");
    else setShiftRows((data || []) as ShiftRow[]);
    setShiftsLoading(false);
  };

  const fetchSettlements = async () => {
    setSettlementLoading(true);
    const { data, error } = await supabase.rpc("get_therapist_monthly_settlements", {
      p_token: token, p_year: year, p_month: month,
    });
    if (error) toast.error("データの取得に失敗しました");
    else setSettlements((data || []) as Settlement[]);
    setSettlementLoading(false);
  };

  const fetchExpenses = async () => {
    setExpensesLoading(true);
    const { data, error } = await supabase.rpc("get_therapist_transport_expenses", {
      p_token: token, p_year: year, p_month: month,
    });
    if (error) toast.error("データの取得に失敗しました");
    else setExpenses((data || []) as TransportExpense[]);
    setExpensesLoading(false);
  };

  const handleTransportSubmit = async () => {
    if (!transportForm.amount || Number(transportForm.amount) <= 0) {
      toast.error("金額を入力してください"); return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_therapist_transport_expense", {
      p_token: token,
      p_date: transportForm.date,
      p_amount: Number(transportForm.amount),
      p_route: transportForm.route || null,
      p_notes: transportForm.notes || null,
    });
    setSubmitting(false);
    if (error) { toast.error("申請に失敗しました: " + error.message); return; }
    toast.success("交通費を申請しました");
    setTransportForm({ date: format(now, "yyyy-MM-dd"), amount: "", route: "", notes: "" });
    fetchExpenses();
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!cast) return null;

  const totalPrice = settlements.reduce((s, r) => s + r.customer_price, 0);
  const totalBack = settlements.reduce((s, r) => s + r.therapist_back, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const monthLabel = `${year}年${month}月`;

  const statusLabel: Record<string, string> = {
    confirmed: "確定", completed: "完了", pending: "確認中", sms_waiting: "確認中",
  };
  const expenseStatusLabel: Record<string, string> = {
    pending: "申請中", approved: "承認済", rejected: "却下",
  };
  const expenseStatusColor: Record<string, string> = {
    pending: "text-amber-600", approved: "text-green-600", rejected: "text-rose-600",
  };
  const shiftStatusLabel: Record<string, string> = {
    pending: "承認待ち", approved: "確定", rejected: "却下",
  };
  const shiftStatusBadge: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  };

  const menuItems = [
    { title: "シフト提出", description: "希望シフトをカレンダーから提出", icon: CalendarPlus, action: () => navigate(`/therapist/${token}/shift`) },
    { title: "シフト確認", description: "確定したシフトと出勤ルームを確認", icon: Calendar, action: () => setView("shift") },
    { title: "投稿管理", description: "O2・エスたまの魂への投稿", icon: Edit, action: () => navigate(`/therapist/${token}/posts`) },
    { title: "精算・売上確認", description: "今月の売上とバック（報酬）を確認", icon: DollarSign, action: () => setView("settlement") },
    { title: "バック表", description: "コース別・オプション別のバック率を確認", icon: Receipt, action: () => setShowBackRates(true) },
    { title: "交通費申請", description: "交通費の申請・申請履歴を確認", icon: Plane, action: () => setView("transport") },
    { title: "退勤フォーム", description: "売上入力・清掃チェック・フィードバック", icon: LogOut, action: () => navigate(`/therapist/${token}/checkout`) },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          {view !== "menu" && (
            <button onClick={() => setView("menu")} className="text-primary flex items-center gap-1 text-sm mr-1">
              <ChevronLeft size={18} />戻る
            </button>
          )}
          {cast.photo && (
            <img src={cast.photo} alt={cast.name} className="h-9 w-9 rounded-full object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-bold text-base leading-tight truncate">{cast.name}様</p>
            <p className="text-xs text-muted-foreground">
              {view === "menu" ? "セラピストポータル" : view === "settlement" ? "精算・売上確認" : view === "shift" ? "シフト確認" : "交通費申請"}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">

        {/* ── MENU ── */}
        {view === "menu" && (
          <div className="space-y-4">
          {/* Clearance notification */}
          {pendingClearance && (
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Banknote className="text-primary shrink-0" size={20} />
                <p className="font-bold text-base">清算のご連絡</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">投函金額</span>
                  <span className="text-2xl font-bold text-primary">
                    ¥{pendingClearance.payout_amount.toLocaleString()}
                  </span>
                </div>
                {pendingClearance.payout_method && (
                  <p className="text-sm bg-muted/50 rounded-lg p-2 mt-2">
                    {pendingClearance.payout_method}
                  </p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => navigate(`/therapist/${token}/checkout?step=cleaning`)}
              >
                <ClipboardCheck size={15} className="mr-2" />
                投函したので清掃フォームを入力する
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  onClick={item.action}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left w-full"
                >
                  <div className="p-2.5 bg-primary/10 rounded-lg shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* ── SHIFT ── */}
        {view === "shift" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="text-muted-foreground hover:text-foreground p-1">
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold text-base">{monthLabel}</span>
              <button onClick={nextMonth} className="text-muted-foreground hover:text-foreground p-1">
                <ChevronLeft size={20} className="rotate-180" />
              </button>
            </div>

            {shiftsLoading ? (
              <div className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
            ) : shiftRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{monthLabel}のシフトはありません</div>
            ) : (
              <div className="rounded-xl border overflow-hidden divide-y">
                {shiftRows.map((s) => (
                  <div key={s.id} className="px-3 py-3 flex items-center gap-3">
                    <div className="text-xs text-muted-foreground whitespace-nowrap w-16">
                      <p className="font-semibold text-foreground">
                        {format(new Date(s.shift_date), "M/d", { locale: ja })}
                      </p>
                      <p>{format(new Date(s.shift_date), "(E)", { locale: ja })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${s.approval_status === "rejected" ? "line-through text-muted-foreground" : ""}`}>
                          {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}
                        </p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${shiftStatusBadge[s.approval_status] ?? "bg-muted text-muted-foreground"}`}>
                          {shiftStatusLabel[s.approval_status] ?? s.approval_status}
                        </span>
                      </div>
                      {s.room && s.approval_status === "approved" && (
                        <p className="text-xs text-primary font-medium mt-0.5">
                          ルーム：{s.room}
                        </p>
                      )}
                      {s.notes && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{s.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTLEMENT ── */}
        {view === "settlement" && (
          <div className="space-y-4">
            {/* Month selector */}
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="text-muted-foreground hover:text-foreground p-1">
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold text-base">{monthLabel}</span>
              <button
                onClick={nextMonth}
                className="text-muted-foreground hover:text-foreground p-1"
                disabled={year === now.getFullYear() && month === now.getMonth() + 1}
              >
                <ChevronLeft size={20} className="rotate-180" />
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">件数</p>
                <p className="text-xl font-bold mt-0.5">{settlements.length}<span className="text-sm font-normal ml-0.5">件</span></p>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">売上合計</p>
                <p className="text-lg font-bold mt-0.5 text-primary">¥{totalPrice.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">バック合計</p>
                <p className="text-lg font-bold mt-0.5 text-green-600">¥{totalBack.toLocaleString()}</p>
              </div>
            </div>

            {/* Reservation list */}
            {settlementLoading ? (
              <div className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>
            ) : settlements.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{monthLabel}の予約はありません</div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-0 text-xs font-semibold text-muted-foreground bg-muted/40 px-3 py-2">
                  <span>日時</span><span className="ml-3">コース</span><span className="text-right pr-2">売上</span><span className="text-right">バック</span>
                </div>
                <div className="divide-y">
                  {settlements.map((r) => (
                    <div key={r.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-0 px-3 py-2.5 items-center">
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        <p>{format(new Date(r.reservation_date), "M/d(E)", { locale: ja })}</p>
                        <p>{r.start_time}</p>
                      </div>
                      <div className="ml-3 min-w-0">
                        <p className="text-sm font-medium truncate">{r.course_name}</p>
                        <p className="text-xs text-muted-foreground">{r.duration}分 · {statusLabel[r.status] ?? r.status}</p>
                      </div>
                      <p className="text-sm font-semibold text-right pr-2">¥{r.customer_price.toLocaleString()}</p>
                      <p className="text-sm font-semibold text-right text-green-600">¥{r.therapist_back.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRANSPORT EXPENSE ── */}
        {view === "transport" && (
          <div className="space-y-5">
            {/* Month selector */}
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="text-muted-foreground hover:text-foreground p-1">
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold text-base">{monthLabel}</span>
              <button
                onClick={nextMonth}
                className="text-muted-foreground hover:text-foreground p-1"
                disabled={year === now.getFullYear() && month === now.getMonth() + 1}
              >
                <ChevronLeft size={20} className="rotate-180" />
              </button>
            </div>

            {/* Submit form */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="font-semibold text-sm">新規申請</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">日付</Label>
                  <Input
                    type="date"
                    value={transportForm.date}
                    onChange={e => setTransportForm(f => ({ ...f, date: e.target.value }))}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">金額（円）</Label>
                  <Input
                    type="number"
                    placeholder="1500"
                    value={transportForm.amount}
                    onChange={e => setTransportForm(f => ({ ...f, amount: e.target.value }))}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">経路</Label>
                <Input
                  placeholder="例：自宅駅 → 仙台駅"
                  value={transportForm.route}
                  onChange={e => setTransportForm(f => ({ ...f, route: e.target.value }))}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">備考</Label>
                <Textarea
                  placeholder="任意"
                  value={transportForm.notes}
                  onChange={e => setTransportForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 text-sm resize-none"
                  rows={2}
                />
              </div>
              <Button onClick={handleTransportSubmit} disabled={submitting} className="w-full h-9">
                <Send size={14} className="mr-2" />
                {submitting ? "申請中..." : "申請する"}
              </Button>
            </div>

            {/* History */}
            <div>
              <p className="font-semibold text-sm mb-2">{monthLabel}の申請履歴</p>
              {expensesLoading ? (
                <div className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>
              ) : expenses.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">{monthLabel}の申請はありません</p>
              ) : (
                <div className="rounded-xl border overflow-hidden divide-y">
                  {expenses.map(e => (
                    <div key={e.id} className="px-3 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">¥{e.amount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(e.expense_date), "M/d(E)", { locale: ja })}
                          {e.route && ` · ${e.route}`}
                        </p>
                        {e.notes && <p className="text-xs text-muted-foreground truncate">{e.notes}</p>}
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${expenseStatusColor[e.status] ?? ""}`}>
                        {expenseStatusLabel[e.status] ?? e.status}
                      </span>
                    </div>
                  ))}
                  <div className="px-3 py-2 bg-muted/30 flex justify-between text-sm font-semibold">
                    <span>合計</span>
                    <span>¥{totalExpenses.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Back rates dialog */}
      <Dialog open={showBackRates} onOpenChange={setShowBackRates}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>バック表</DialogTitle></DialogHeader>
          <img src={backRatesImage} alt="バック表" className="w-full h-auto mt-2" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
