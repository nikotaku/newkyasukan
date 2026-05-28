import { useState, useEffect, useCallback } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  format, parseISO, startOfMonth, endOfMonth,
  eachDayOfInterval, subMonths, addMonths, isToday, isFuture,
} from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Lock, CheckCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface DaySummary {
  date: string;
  revenue: number;
  count: number;
  completedCount: number;
  closing: ClosingRecord | null;
}

interface ClosingRecord {
  id: string;
  period_date: string;
  total_sales: number;
  total_reservations: number;
  expense_amount: number;
  deduction_amount: number;
  notes: string | null;
  closed_at: string;
}

interface Reservation {
  id: string;
  customer_name: string;
  start_time: string;
  course_name: string;
  price: number;
  status: string;
  casts: { name: string } | null;
}

const yen = (v: number) => v === 0 ? "¥0" : `¥${v.toLocaleString()}`;

export default function SalesDailySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [baseDate, setBaseDate] = useState(new Date());
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail panel state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailReservations, setDetailReservations] = useState<Reservation[]>([]);
  const [detailClosing, setDetailClosing] = useState<ClosingRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchMonth();
  }, [user, baseDate]);

  const fetchMonth = async () => {
    setLoading(true);
    const from = format(startOfMonth(baseDate), "yyyy-MM-dd");
    const to = format(endOfMonth(baseDate), "yyyy-MM-dd");
    try {
      const [resResult, closingsResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("start_time, price, status")
          .gte("start_time", `${from}T00:00:00`)
          .lte("start_time", `${to}T23:59:59`)
          .neq("status", "cancelled"),
        supabase
          .from("closings" as any)
          .select("*")
          .eq("period_type", "daily")
          .gte("period_date", from)
          .lte("period_date", to),
      ]);

      const closingMap: Record<string, ClosingRecord> = {};
      ((closingsResult.data as any[]) || []).forEach((c: ClosingRecord) => {
        closingMap[c.period_date] = c;
      });

      const byDate: Record<string, { revenue: number; count: number; completedCount: number }> = {};
      for (const r of resResult.data || []) {
        const d = r.start_time.slice(0, 10);
        if (!byDate[d]) byDate[d] = { revenue: 0, count: 0, completedCount: 0 };
        byDate[d].count += 1;
        if (r.status === "completed") {
          byDate[d].revenue += r.price ?? 0;
          byDate[d].completedCount += 1;
        }
      }

      const days = eachDayOfInterval({ start: startOfMonth(baseDate), end: endOfMonth(baseDate) });
      setSummaries(
        days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          return {
            date: key,
            ...(byDate[key] ?? { revenue: 0, count: 0, completedCount: 0 }),
            closing: closingMap[key] ?? null,
          };
        })
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = useCallback(async (dateStr: string) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(dateStr);
    setDetailLoading(true);
    try {
      const [resResult, closingResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, customer_name, start_time, course_name, price, status, casts(name)")
          .eq("reservation_date", dateStr)
          .in("status", ["confirmed", "completed", "pending"])
          .order("start_time"),
        supabase
          .from("closings" as any)
          .select("*")
          .eq("period_type", "daily")
          .eq("period_date", dateStr)
          .maybeSingle(),
      ]);
      setDetailReservations((resResult.data as Reservation[]) || []);
      const c = closingResult.data as ClosingRecord | null;
      setDetailClosing(c);
      setExpenseAmount(c?.expense_amount ?? 0);
      setDeductionAmount(c?.deduction_amount ?? 0);
      setNotes(c?.notes ?? "");
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedDate]);

  const handleClose = async () => {
    if (!selectedDate) return;
    setSubmitting(true);
    try {
      const totalSales = detailReservations
        .filter((r) => r.status === "completed")
        .reduce((s, r) => s + r.price, 0);
      const { error } = await supabase.from("closings" as any).upsert(
        {
          period_type: "daily",
          period_date: selectedDate,
          total_sales: totalSales,
          total_reservations: detailReservations.filter((r) => r.status === "completed").length,
          expense_amount: expenseAmount,
          deduction_amount: deductionAmount,
          notes: notes || null,
          closed_at: new Date().toISOString(),
        },
        { onConflict: "period_type,period_date" }
      );
      if (error) throw error;
      toast.success(`${format(parseISO(selectedDate), "M月d日", { locale: ja })} 締め作業完了`);
      await fetchMonth();
      // refresh closing in detail
      const { data } = await supabase
        .from("closings" as any)
        .select("*")
        .eq("period_type", "daily")
        .eq("period_date", selectedDate)
        .maybeSingle();
      setDetailClosing(data as ClosingRecord | null);
    } catch (e: any) {
      toast.error(`締め作業に失敗しました: ${e?.message ?? "不明なエラー"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const monthTotal = summaries.reduce(
    (s, d) => ({ revenue: s.revenue + d.revenue, count: s.count + d.count }),
    { revenue: 0, count: 0 }
  );
  const closedCount = summaries.filter((d) => d.closing).length;
  const pastDays = summaries.filter((d) => !isFuture(parseISO(d.date))).length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">日別売上</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                締め済み {closedCount} / {pastDays} 日
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setBaseDate(subMonths(baseDate, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-semibold w-24 text-center">
                {format(baseDate, "yyyy年M月", { locale: ja })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBaseDate(addMonths(baseDate, 1))}
                disabled={format(baseDate, "yyyy-MM") >= format(new Date(), "yyyy-MM")}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <div className="space-y-3">
              {/* Monthly table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          {["日付", "売上", "件数", "経費", "控除", "ステータス"].map((h) => (
                            <th
                              key={h}
                              className="py-2.5 px-4 font-semibold whitespace-nowrap text-left first:text-left [&:not(:first-child)]:text-right last:text-center"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summaries.map((row) => {
                          const d = parseISO(row.date);
                          const isSun = format(d, "e") === "1";
                          const isSat = format(d, "e") === "7";
                          const today = isToday(d);
                          const future = isFuture(d);
                          const isSelected = selectedDate === row.date;

                          return (
                            <tr
                              key={row.date}
                              onClick={() => !future && openDetail(row.date)}
                              className={`border-b transition-colors ${
                                future ? "opacity-30 cursor-default" :
                                isSelected ? "bg-primary/10 cursor-pointer" :
                                today ? "bg-primary/5 cursor-pointer hover:bg-primary/10" :
                                "cursor-pointer hover:bg-muted/40"
                              }`}
                            >
                              <td className={`py-2.5 px-4 font-medium whitespace-nowrap ${
                                isSun ? "text-red-500" : isSat ? "text-blue-500" : ""
                              }`}>
                                {format(d, "d日(E)", { locale: ja })}
                                {today && <span className="ml-1 text-xs text-primary">今日</span>}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums">
                                {row.revenue > 0 ? yen(row.revenue) : "—"}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-blue-500">
                                {row.count > 0 ? `${row.count}件` : "—"}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                                {row.closing?.expense_amount ? yen(row.closing.expense_amount) : "—"}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                                {row.closing?.deduction_amount ? yen(row.closing.deduction_amount) : "—"}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                {row.closing ? (
                                  <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">締め済</Badge>
                                ) : future ? null : (
                                  <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">未締め</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        <tr className="border-t-2 bg-muted/20 font-semibold">
                          <td className="py-3 px-4">合計</td>
                          <td className="py-3 px-4 text-right tabular-nums">{yen(monthTotal.revenue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-blue-500">{monthTotal.count}件</td>
                          <td colSpan={3} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Detail panel */}
              {selectedDate && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>
                        {format(parseISO(selectedDate), "M月d日(E)", { locale: ja })} — 締め作業
                      </span>
                      <div className="flex items-center gap-2">
                        {detailClosing && (
                          <span className="text-xs text-green-600 font-normal">
                            <CheckCircle size={12} className="inline mr-1" />
                            {format(new Date(detailClosing.closed_at), "M/d HH:mm")} 締め済み
                          </span>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                          <X size={14} />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {detailLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {/* Reservations */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            予約一覧
                          </p>
                          {detailReservations.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-3">予約なし</p>
                          ) : (
                            <div className="border rounded-md divide-y text-sm">
                              {detailReservations.map((r) => (
                                <div key={r.id} className="flex items-center justify-between px-3 py-2">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium tabular-nums">
                                      {r.start_time.slice(11, 16)}
                                    </span>
                                    <span>{r.customer_name}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {r.casts?.name ?? "未設定"} / {r.course_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      r.status === "completed"
                                        ? "bg-green-100 text-green-700"
                                        : r.status === "confirmed"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-orange-100 text-orange-700"
                                    }`}>
                                      {r.status === "completed" ? "完了" : r.status === "confirmed" ? "確定" : "仮"}
                                    </span>
                                    <span className="font-semibold tabular-nums">
                                      ¥{r.price.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              <div className="flex justify-between px-3 py-2 bg-muted/30 font-semibold">
                                <span>完了合計</span>
                                <span>
                                  {yen(
                                    detailReservations
                                      .filter((r) => r.status === "completed")
                                      .reduce((s, r) => s + r.price, 0)
                                  )}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Expense / Deduction inputs */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs mb-1 block">経費（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              placeholder="0"
                              value={expenseAmount === 0 ? "" : expenseAmount}
                              onChange={(e) => setExpenseAmount(Number(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block">控除（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              placeholder="0"
                              value={deductionAmount === 0 ? "" : deductionAmount}
                              onChange={(e) => setDeductionAmount(Number(e.target.value) || 0)}
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs mb-1 block">メモ</Label>
                          <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="特記事項があれば入力..."
                            rows={2}
                          />
                        </div>

                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleClose}
                          disabled={submitting}
                        >
                          {submitting ? (
                            <><Loader2 size={15} className="mr-2 animate-spin" />処理中...</>
                          ) : detailClosing ? (
                            <><CheckCircle size={15} className="mr-2" />再締め（上書き確定）</>
                          ) : (
                            <><Lock size={15} className="mr-2" />
                              {format(parseISO(selectedDate), "M月d日", { locale: ja })} 締め作業完了
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
