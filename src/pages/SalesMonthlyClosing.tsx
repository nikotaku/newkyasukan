import { useState, useEffect, useCallback } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronDown, Loader2, CheckCircle, AlertCircle, Users, Receipt, Wallet, TrendingUp } from "lucide-react";
import { toast } from "sonner";

/**
 * 月別清算：毎月の締め作業。
 * ・セラピスト報酬（日別精算のバック合計・キャスト別内訳）
 * ・雑費・宿泊費・交通費（日別精算の各費目合計）
 * ・経費（固定費の未払い・未入力チェックリスト）
 * の3トグルで、タップすると内訳が開く。
 */

// 毎月チェックする固定費項目（経費入力の固定費カテゴリと同一）
const FIXED_ITEMS = [
  "賃借料（ラズルーム）",
  "賃借料（インルーム）",
  "広告媒体費（エスたま）",
  "広告媒体費（エスラン）",
  "紹介広告費",
  "ラズルーム電気代",
  "ラズルームガス代",
  "ラズルーム水道代",
  "インルーム電気代",
  "インルーム水道代",
  "固定交際費",
  "通信費",
];

interface ExpenseRec {
  id: string;
  date: string;
  category: string;
  amount: number;
}

interface ClearanceRec {
  cast_name: string;
  total_sales: number;
  therapist_back: number;
  misc_expenses: number;
  accommodation_fee: number;
  transportation_fee: number;
  other_expenses: number;
}

const yen = (v: number) => `¥${v.toLocaleString()}`;

export default function SalesMonthlyClosing() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [records, setRecords] = useState<ExpenseRec[]>([]);
  const [clearances, setClearances] = useState<ClearanceRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["expenses"]));

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const monthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
    const [expRes, clrRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("id, expense_date, expense_type, amount")
        .gte("expense_date", monthStart)
        .lte("expense_date", monthEnd),
      supabase
        .from("daily_clearances")
        .select("total_sales, therapist_back, misc_expenses, accommodation_fee, transportation_fee, other_expenses, casts(name)")
        .gte("date", monthStart)
        .lte("date", monthEnd),
    ]);
    if (!expRes.error) {
      setRecords((expRes.data || []).map((r: any) => ({
        id: r.id,
        date: r.expense_date,
        category: r.expense_type,
        amount: r.amount,
      })));
    }
    if (!clrRes.error) {
      setClearances((clrRes.data || []).map((r: any) => ({
        cast_name: r.casts?.name ?? "不明",
        total_sales: r.total_sales ?? 0,
        therapist_back: r.therapist_back ?? 0,
        misc_expenses: r.misc_expenses ?? 0,
        accommodation_fee: r.accommodation_fee ?? 0,
        transportation_fee: r.transportation_fee ?? 0,
        other_expenses: (Array.isArray(r.other_expenses) ? r.other_expenses : [])
          .reduce((s: number, o: any) => s + (o?.amount ?? 0), 0),
      })));
    }
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── セラピスト報酬（キャスト別バック合計） ──
  const backByCast = new Map<string, { total: number; days: number }>();
  for (const c of clearances) {
    const cur = backByCast.get(c.cast_name) || { total: 0, days: 0 };
    cur.total += c.therapist_back;
    cur.days += 1;
    backByCast.set(c.cast_name, cur);
  }
  const castRows = [...backByCast.entries()].sort((a, b) => b[1].total - a[1].total);
  const totalBack = clearances.reduce((s, c) => s + c.therapist_back, 0);

  // ── 売上（日別精算の売上合計） ──
  const totalSales = clearances.reduce((s, c) => s + c.total_sales, 0);

  // ── 雑費・宿泊費・交通費 ──
  const totalMisc = clearances.reduce((s, c) => s + c.misc_expenses, 0);
  const totalAccom = clearances.reduce((s, c) => s + c.accommodation_fee, 0);
  const totalTransport = clearances.reduce((s, c) => s + c.transportation_fee, 0);
  const totalOther = clearances.reduce((s, c) => s + c.other_expenses, 0);
  // 回収＝セラピストのバックから差し引いた諸費（店側のプラス）
  const totalRecovered = totalMisc + totalAccom + totalOther;
  // 実支払給与 = バック − 雑費 − 宿泊費 − その他 ＋ 交通費（日別精算の給与式と同一）
  const totalSalaryPaid = totalBack - totalRecovered + totalTransport;

  // ── 経費（固定費チェックリスト） ──
  const sumFor = (item: string) =>
    records.filter((r) => r.category === item).reduce((s, r) => s + (r.amount || 0), 0);
  const isEntered = (item: string) => records.some((r) => r.category === item);
  const pendingItems = FIXED_ITEMS.filter((i) => !isEntered(i));
  const doneItems = FIXED_ITEMS.filter((i) => isEntered(i));
  const totalFixed = doneItems.reduce((s, i) => s + sumFor(i), 0);
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());
  const allDone = pendingItems.length === 0;

  const handleRegister = async (item: string) => {
    const amount = Number(inputs[item] || 0);
    if (!amount || amount <= 0) {
      toast.error("金額を入力してください");
      return;
    }
    setSavingItem(item);
    // 登録日は当月なら今日、過去月なら月末
    const date = isCurrentMonth
      ? format(new Date(), "yyyy-MM-dd")
      : format(endOfMonth(selectedMonth), "yyyy-MM-dd");
    const { error } = await supabase.from("expenses").insert([{
      expense_date: date,
      expense_type: item,
      amount,
      description: `${format(selectedMonth, "M月", { locale: ja })}分 ${item}`,
      payment_method: "bank_transfer",
    }]);
    setSavingItem(null);
    if (error) {
      toast.error(`登録失敗: ${error.message}`);
      return;
    }
    toast.success(`${item} を登録しました`);
    setInputs((p) => ({ ...p, [item]: "" }));
    fetchData();
  };

  const SectionHeader = ({
    id, icon, title, total, sub,
  }: { id: string; icon: React.ReactNode; title: string; total: number; sub?: string }) => (
    <button
      type="button"
      className="w-full px-4 py-3.5 flex items-center gap-3"
      onClick={() => toggleSection(id)}
    >
      <span className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">{icon}</span>
      <span className="text-left min-w-0 flex-1">
        <span className="font-bold text-sm block">{title}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      <span className="font-bold tabular-nums text-primary">{yen(total)}</span>
      <ChevronDown
        size={16}
        className={`text-muted-foreground shrink-0 transition-transform ${openSections.has(id) ? "rotate-180" : ""}`}
      />
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">月別清算</h1>
              <p className="text-muted-foreground text-sm">毎月の締め作業：報酬・諸費・固定費のチェック</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setSelectedMonth((d) => subMonths(d, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-semibold px-3 w-28 text-center">
                {format(selectedMonth, "yyyy年M月", { locale: ja })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setSelectedMonth((d) => addMonths(d, 1))} disabled={isCurrentMonth}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">

              {/* ── 売上（日別精算ベース） ── */}
              <Card>
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-primary/10 text-primary shrink-0"><TrendingUp size={16} /></span>
                  <span className="text-left min-w-0 flex-1">
                    <span className="font-bold text-sm block">売上</span>
                    <span className="text-[11px] text-muted-foreground">日別精算の売上合計（{clearances.length}件）</span>
                  </span>
                  <span className="font-bold tabular-nums text-lg text-primary">{yen(totalSales)}</span>
                </div>
              </Card>

              {/* ── セラピスト報酬 ── */}
              <Card>
                <SectionHeader
                  id="back"
                  icon={<Users size={16} />}
                  title="セラピスト報酬"
                  sub={`バック合計・相殺前（実支払 ${yen(totalSalaryPaid)}）`}
                  total={totalBack}
                />
                {openSections.has("back") && (
                  <CardContent className="p-0 border-t">
                    {castRows.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-8">精算データがありません</p>
                    ) : (
                      <div className="divide-y">
                        {castRows.map(([name, v]) => (
                          <div key={name} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-sm">
                              {name}
                              <span className="ml-2 text-xs text-muted-foreground">{v.days}日</span>
                            </span>
                            <span className="font-semibold tabular-nums">{yen(v.total)}</span>
                          </div>
                        ))}
                        <div className="px-4 py-3 flex items-center justify-between bg-muted/30 font-bold">
                          <span className="text-sm">バック合計（相殺前）</span>
                          <span className="tabular-nums">{yen(totalBack)}</span>
                        </div>
                        <div className="px-4 py-2 flex items-center justify-between text-sm text-muted-foreground">
                          <span>回収（雑費・宿泊費・その他）</span>
                          <span className="tabular-nums">−{yen(totalRecovered)}</span>
                        </div>
                        <div className="px-4 py-2 flex items-center justify-between text-sm text-muted-foreground">
                          <span>交通費（追加支給）</span>
                          <span className="tabular-nums">＋{yen(totalTransport)}</span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between bg-primary/5 font-bold">
                          <span className="text-sm">実際に支払った給与合計</span>
                          <span className="tabular-nums text-primary">{yen(totalSalaryPaid)}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* ── 雑費・宿泊費・交通費 ── */}
              <Card>
                <SectionHeader
                  id="allowance"
                  icon={<Wallet size={16} />}
                  title="雑費・宿泊費・交通費"
                  sub={`回収 ${yen(totalRecovered)} ／ 交通費支払 ${yen(totalTransport)}`}
                  total={totalRecovered}
                />
                {openSections.has("allowance") && (
                  <CardContent className="p-0 border-t">
                    <div className="divide-y">
                      <div className="px-4 py-2 bg-muted/40 text-xs font-bold text-muted-foreground">
                        回収した諸費（セラピストのバックから差引）
                      </div>
                      {[
                        ["雑費", totalMisc],
                        ["宿泊費", totalAccom],
                        ["その他（清算時入力）", totalOther],
                      ].map(([label, v]) => (
                        <div key={label as string} className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-sm">{label}</span>
                          <span className="font-semibold tabular-nums">{yen(v as number)}</span>
                        </div>
                      ))}
                      <div className="px-4 py-3 flex items-center justify-between bg-muted/30 font-bold">
                        <span className="text-sm">回収合計</span>
                        <span className="tabular-nums text-green-600">{yen(totalRecovered)}</span>
                      </div>
                      <div className="px-4 py-2 bg-muted/40 text-xs font-bold text-muted-foreground">
                        店から支払った費用
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between font-bold">
                        <span className="text-sm">交通費 合計</span>
                        <span className="tabular-nums text-rose-600">{yen(totalTransport)}</span>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* ── 経費（固定費チェックリスト） ── */}
              <Card className={pendingItems.length > 0 ? "border-amber-300" : ""}>
                <SectionHeader
                  id="expenses"
                  icon={<Receipt size={16} />}
                  title="経費"
                  sub={allDone
                    ? "固定費はすべて入力済み"
                    : `未入力・未払い ${pendingItems.length}件（入力済み ${doneItems.length}/${FIXED_ITEMS.length}件）`}
                  total={totalFixed}
                />
                {openSections.has("expenses") && (
                  <CardContent className="p-3 border-t space-y-3">
                    {/* 進捗サマリー */}
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium ${
                      allDone
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}>
                      {allDone ? <CheckCircle size={16} className="text-green-600" /> : <AlertCircle size={16} className="text-amber-600" />}
                      {allDone
                        ? `${format(selectedMonth, "M月", { locale: ja })}の固定費はすべて入力済みです（合計 ${yen(totalFixed)}）`
                        : `未入力・未払いが ${pendingItems.length}件 あります（入力済み ${doneItems.length}/${FIXED_ITEMS.length}件）`}
                    </div>

                    {/* 未入力・未払い一覧 */}
                    {pendingItems.length > 0 && (
                      <div className="rounded-lg border border-amber-300 overflow-hidden">
                        <div className="px-4 py-2.5 bg-amber-100 font-bold text-sm text-amber-800">
                          未入力・未払い（{pendingItems.length}件）
                        </div>
                        <div className="divide-y">
                          {pendingItems.map((item) => (
                            <div key={item} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                              <span className="flex-1 min-w-[160px] text-sm font-medium">{item}</span>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  placeholder="金額"
                                  className="w-32 h-9 text-sm"
                                  value={inputs[item] ?? ""}
                                  onChange={(e) => setInputs((p) => ({ ...p, [item]: e.target.value }))}
                                />
                                <Button
                                  size="sm"
                                  className="h-9"
                                  disabled={savingItem === item || !Number(inputs[item] || 0)}
                                  onClick={() => handleRegister(item)}
                                >
                                  {savingItem === item ? <Loader2 size={13} className="animate-spin" /> : "支払・登録"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 入力済み一覧 */}
                    <div className="rounded-lg border overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/40 font-bold text-sm text-muted-foreground">
                        入力済み（{doneItems.length}件）
                      </div>
                      {doneItems.length === 0 ? (
                        <p className="text-center text-muted-foreground text-sm py-8">まだ入力がありません</p>
                      ) : (
                        <div className="divide-y">
                          {doneItems.map((item) => (
                            <div key={item} className="px-4 py-3 flex items-center justify-between gap-3">
                              <span className="text-sm flex items-center gap-2">
                                <CheckCircle size={14} className="text-green-600 shrink-0" />
                                {item}
                              </span>
                              <span className="font-bold tabular-nums">{yen(sumFor(item))}</span>
                            </div>
                          ))}
                          <div className="px-4 py-3 flex items-center justify-between bg-muted/30 font-bold">
                            <span className="text-sm">固定費 合計</span>
                            <span className="tabular-nums text-primary">{yen(totalFixed)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      ※ 登録すると「経費入力」の固定費として記録されます。同月に複数回の支払いがある場合は経費入力から追加できます。
                    </p>
                  </CardContent>
                )}
              </Card>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
