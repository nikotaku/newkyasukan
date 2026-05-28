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
import { ChevronLeft, ChevronRight, CheckCircle, Loader2, X, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface DaySummary {
  date: string;
  revenue: number;
  count: number;
  clearanceCount: number;
  totalCasts: number;
}

interface Reservation {
  id: string;
  customer_name: string;
  start_time: string;
  course_name: string;
  price: number;
  status: string;
  course_type: string | null;
  duration: number | null;
  cast_id: string | null;
  casts: { id: string; name: string } | null;
}

interface CastGroup {
  castId: string;
  castName: string;
  reservations: Reservation[];
  totalSales: number;
  autoBack: number;
}

interface Clearance {
  id: string;
  cast_id: string;
  therapist_back: number;
  misc_expenses: number;
  accommodation_fee: number;
  payout_amount: number;
  payout_method: string | null;
  status: string;
  cleared_at: string | null;
}

interface ClearanceInput {
  therapistBack: number;
  miscExpenses: number;
  accommodationFee: number;
  payoutMethod: string;
  submitting: boolean;
}

const yen = (v: number) => v === 0 ? "¥0" : `¥${v.toLocaleString()}`;

export default function SalesDailySales() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [baseDate, setBaseDate] = useState(new Date());
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [castGroups, setCastGroups] = useState<CastGroup[]>([]);
  const [clearances, setClearances] = useState<Record<string, Clearance>>({});
  const [clearanceInputs, setClearanceInputs] = useState<Record<string, ClearanceInput>>({});
  const [detailLoading, setDetailLoading] = useState(false);

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
      const [resResult, clearResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("start_time, price, status, cast_id")
          .gte("start_time", `${from}T00:00:00`)
          .lte("start_time", `${to}T23:59:59`)
          .in("status", ["confirmed", "completed"]),
        supabase
          .from("daily_clearances" as any)
          .select("cast_id, date, status")
          .gte("date", from)
          .lte("date", to),
      ]);

      const resByDate: Record<string, { revenue: number; count: number; castIds: Set<string> }> = {};
      for (const r of resResult.data || []) {
        const d = r.start_time.slice(0, 10);
        if (!resByDate[d]) resByDate[d] = { revenue: 0, count: 0, castIds: new Set() };
        resByDate[d].count += 1;
        if (r.status === "completed") resByDate[d].revenue += r.price ?? 0;
        if (r.cast_id) resByDate[d].castIds.add(r.cast_id);
      }

      const clearByDate: Record<string, { cleared: number; total: number }> = {};
      for (const c of (clearResult.data as any[]) || []) {
        const d = c.date;
        if (!clearByDate[d]) clearByDate[d] = { cleared: 0, total: 0 };
        clearByDate[d].total += 1;
        if (c.status === "completed") clearByDate[d].cleared += 1;
      }

      const days = eachDayOfInterval({ start: startOfMonth(baseDate), end: endOfMonth(baseDate) });
      setSummaries(
        days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const rb = resByDate[key];
          const cb = clearByDate[key];
          return {
            date: key,
            revenue: rb?.revenue ?? 0,
            count: rb?.count ?? 0,
            clearanceCount: cb?.cleared ?? 0,
            totalCasts: rb?.castIds.size ?? 0,
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
    if (selectedDate === dateStr) { setSelectedDate(null); return; }
    setSelectedDate(dateStr);
    setDetailLoading(true);
    try {
      const [resResult, backRatesResult, clearResult] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, customer_name, start_time, course_name, price, status, course_type, duration, cast_id, casts(id, name)")
          .eq("reservation_date", dateStr)
          .in("status", ["confirmed", "completed"])
          .order("start_time"),
        supabase.from("back_rates").select("course_type, duration, therapist_back"),
        supabase
          .from("daily_clearances" as any)
          .select("*")
          .eq("date", dateStr),
      ]);

      // build back rate lookup
      const brMap: Record<string, number> = {};
      for (const br of backRatesResult.data || []) {
        brMap[`${br.course_type}_${br.duration}`] = br.therapist_back ?? 0;
      }

      // group by cast
      const groups: Record<string, CastGroup> = {};
      for (const r of (resResult.data as Reservation[]) || []) {
        const castId = r.cast_id ?? "unknown";
        const castName = r.casts?.name ?? "未設定";
        if (!groups[castId]) {
          groups[castId] = { castId, castName, reservations: [], totalSales: 0, autoBack: 0 };
        }
        groups[castId].reservations.push(r);
        groups[castId].totalSales += r.price ?? 0;
        groups[castId].autoBack += brMap[`${r.course_type}_${r.duration}`] ?? 0;
      }

      const groupList = Object.values(groups).sort((a, b) => a.castName.localeCompare(b.castName));
      setCastGroups(groupList);

      // existing clearances
      const clearMap: Record<string, Clearance> = {};
      for (const c of (clearResult.data as Clearance[]) || []) {
        clearMap[c.cast_id] = c;
      }
      setClearances(clearMap);

      // init inputs
      const inputs: Record<string, ClearanceInput> = {};
      for (const g of groupList) {
        const existing = clearMap[g.castId];
        inputs[g.castId] = {
          therapistBack: existing?.therapist_back ?? g.autoBack,
          miscExpenses: existing?.misc_expenses ?? 0,
          accommodationFee: existing?.accommodation_fee ?? 0,
          payoutMethod: existing?.payout_method ?? "",
          submitting: false,
        };
      }
      setClearanceInputs(inputs);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedDate]);

  const updateInput = (castId: string, field: keyof ClearanceInput, value: any) => {
    setClearanceInputs((prev) => ({ ...prev, [castId]: { ...prev[castId], [field]: value } }));
  };

  const handleClear = async (group: CastGroup) => {
    const input = clearanceInputs[group.castId];
    if (!input || !selectedDate) return;
    updateInput(group.castId, "submitting", true);
    const payout = input.therapistBack - input.miscExpenses - input.accommodationFee;
    try {
      const { error: upsertErr } = await supabase.from("daily_clearances" as any).upsert(
        {
          cast_id: group.castId,
          date: selectedDate,
          total_sales: group.totalSales,
          therapist_back: input.therapistBack,
          misc_expenses: input.miscExpenses,
          accommodation_fee: input.accommodationFee,
          payout_amount: payout,
          payout_method: input.payoutMethod || null,
          status: "pending",
          points_awarded: 0.5,
          cleared_at: new Date().toISOString(),
        },
        { onConflict: "cast_id,date" }
      );
      if (upsertErr) throw upsertErr;

      // award 0.5pt (only if not already cleared)
      if (!clearances[group.castId]) {
        await supabase.rpc("increment_cast_points" as any, {
          p_cast_id: group.castId,
          p_points: 0.5,
        }).catch(() => {
          // RPC may not exist yet; silently skip
        });
      }

      toast.success(`${group.castName} の清算が完了しました`);
      // refresh clearance map
      const { data } = await supabase.from("daily_clearances" as any).select("*").eq("date", selectedDate);
      const clearMap: Record<string, Clearance> = {};
      for (const c of (data as Clearance[]) || []) clearMap[c.cast_id] = c;
      setClearances(clearMap);
      fetchMonth();
    } catch (e: any) {
      toast.error(`清算に失敗しました: ${e?.message ?? "不明なエラー"}`);
    } finally {
      updateInput(group.castId, "submitting", false);
    }
  };

  const monthTotal = summaries.reduce((s, d) => ({ revenue: s.revenue + d.revenue, count: s.count + d.count }), { revenue: 0, count: 0 });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">日別清算</h1>
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
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          {["日付", "売上", "件数", "清算"].map((h) => (
                            <th key={h} className="py-2.5 px-4 font-semibold whitespace-nowrap text-left first:text-left [&:not(:first-child)]:text-right last:text-center">
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
                          const allCleared = row.totalCasts > 0 && row.clearanceCount >= row.totalCasts;

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
                              <td className={`py-2.5 px-4 font-medium whitespace-nowrap ${isSun ? "text-red-500" : isSat ? "text-blue-500" : ""}`}>
                                {format(d, "d日(E)", { locale: ja })}
                                {today && <span className="ml-1 text-xs text-primary">今日</span>}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums">
                                {row.revenue > 0 ? yen(row.revenue) : "—"}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-blue-500">
                                {row.count > 0 ? `${row.count}件` : "—"}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                {row.totalCasts === 0 ? null : allCleared ? (
                                  <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">清算済</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">
                                    {row.clearanceCount}/{row.totalCasts}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 bg-muted/20 font-semibold">
                          <td className="py-3 px-4">合計</td>
                          <td className="py-3 px-4 text-right tabular-nums">{yen(monthTotal.revenue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-blue-500">{monthTotal.count}件</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Detail panel */}
              {selectedDate && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-base">
                      {format(parseISO(selectedDate), "M月d日(E)", { locale: ja })} — 清算
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                      <X size={14} />
                    </Button>
                  </div>

                  {detailLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
                  ) : castGroups.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground text-sm">
                        この日の予約がありません
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {castGroups.map((g) => {
                        const input = clearanceInputs[g.castId] ?? { therapistBack: 0, miscExpenses: 0, accommodationFee: 0, payoutMethod: "", submitting: false };
                        const cleared = clearances[g.castId];
                        const payout = input.therapistBack - input.miscExpenses - input.accommodationFee;

                        return (
                          <Card key={g.castId} className={cleared ? "border-green-200" : "border-primary/20"}>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                  <CreditCard size={15} className="text-primary" />
                                  {g.castName}
                                </span>
                                {cleared ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">
                                    <CheckCircle size={10} className="mr-1" />清算済み
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">未清算</Badge>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {/* Reservation list */}
                              <div className="border rounded-md divide-y text-sm">
                                {g.reservations.map((r) => (
                                  <div key={r.id} className="flex items-center justify-between px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium tabular-nums text-xs">{r.start_time.slice(11, 16)}</span>
                                      <span>{r.customer_name}</span>
                                      <span className="text-muted-foreground text-xs">{r.course_name}</span>
                                    </div>
                                    <span className="font-semibold tabular-nums text-xs">¥{r.price.toLocaleString()}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between px-3 py-2 bg-muted/30 font-semibold text-sm">
                                  <span>売上合計</span>
                                  <span>{yen(g.totalSales)}</span>
                                </div>
                              </div>

                              {/* Inputs */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs mb-1 block">バック（円）</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={input.therapistBack === 0 ? "" : input.therapistBack}
                                    onChange={(e) => updateInput(g.castId, "therapistBack", Number(e.target.value) || 0)}
                                  />
                                  {g.autoBack > 0 && input.therapistBack === g.autoBack && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">バック表より自動入力</p>
                                  )}
                                </div>
                                <div>
                                  <Label className="text-xs mb-1 block">雑費（円）</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={input.miscExpenses === 0 ? "" : input.miscExpenses}
                                    onChange={(e) => updateInput(g.castId, "miscExpenses", Number(e.target.value) || 0)}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs mb-1 block">宿泊費（円）</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={input.accommodationFee === 0 ? "" : input.accommodationFee}
                                    onChange={(e) => updateInput(g.castId, "accommodationFee", Number(e.target.value) || 0)}
                                  />
                                </div>
                                <div className="flex items-end">
                                  <div className="w-full p-3 bg-primary/5 rounded-md text-center">
                                    <p className="text-xs text-muted-foreground">投函金額</p>
                                    <p className="text-lg font-bold text-primary">{yen(payout)}</p>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <Label className="text-xs mb-1 block">投函方法・アナウンス</Label>
                                <Textarea
                                  value={input.payoutMethod}
                                  onChange={(e) => updateInput(g.castId, "payoutMethod", e.target.value)}
                                  placeholder="例：〇〇ルームの引き出しに入れています"
                                  rows={2}
                                />
                              </div>

                              <Button
                                className="w-full"
                                onClick={() => handleClear(g)}
                                disabled={input.submitting}
                              >
                                {input.submitting ? (
                                  <><Loader2 size={14} className="mr-2 animate-spin" />処理中...</>
                                ) : cleared ? (
                                  <><CheckCircle size={14} className="mr-2" />再清算（上書き）</>
                                ) : (
                                  <><CreditCard size={14} className="mr-2" />{g.castName} を清算する</>
                                )}
                              </Button>

                              {cleared && (
                                <p className="text-xs text-center text-muted-foreground">
                                  {format(new Date(cleared.cleared_at!), "M/d HH:mm")} に清算済み ·
                                  投函金額 {yen(cleared.payout_amount)}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
